import { Request, Response } from 'express'
import moment from 'moment'
import fetch from 'node-fetch'

import * as db from '../../db'

import { Actions, Interactions } from '../constants'
import { ActionResponseBody, TeamId, InboundInteraction } from '../types'
import { postAttendanceMessage } from '../attendance'
import { postRehearsalMusic } from '..'
import { SlackClient } from '../client'
import { setSheetIdView, chooseAttendancePostBlocks, reportView } from './views'
import { processConfigSubmission } from './config'

export async function handleInteractions(
  req: Request,
  res: Response
): Promise<void> {
  const payload: InboundInteraction = JSON.parse(req.body.payload)
  const { actions, team, trigger_id, view, type } = payload
  const token = await db.getValue('teams', team.id, 'access_token')
  res.send()

  if (view != null && type === Interactions.VIEW_SUBMISSION) {
    await processConfigSubmission({
      values: view.state.values,
      teamId: team.id
    })
  }

  if (actions != null) {
    const action = actions[0]
    const { action_id } = action

    switch (action_id) {
      case Actions.POST_ATTENDANCE_MESSAGE:
        postManually({
          selectedOption: 'attendance',
          teamId: team.id
        })
        break
      case Actions.POST_REHEARSAL_MESSAGE:
        postManually({
          selectedOption: 'rehearsal',
          teamId: team.id
        })
        break
      case Actions.SELECT_REHEARSAL_DAY:
        db.updateDbValue('teams', team.id, {
          [action_id]: action.selected_option.value
        })
        break
      case Actions.YES_NO_REMINDERS:
        db.updateDbValue('teams', team.id, {
          [action_id]: action.selected_option.value === 'true'
        })
        break
      case Actions.SHOW_SHEET_MODAL:
        SlackClient.views.open({ view: setSheetIdView, token, trigger_id })
        break
      case Actions.SET_ATTENDANCE_BLOCKS:
        const view = await chooseAttendancePostBlocks(team.id)
        SlackClient.views.open({
          view,
          token,
          trigger_id
        })
        break
      case Actions.VIEW_REPORT:
        const repView = await reportView(team.id, token)
        SlackClient.views.open({
          view: repView,
          token,
          trigger_id
        })
        break
      default:
        break
    }
  }
}

export async function postToResponseUrl(
  responseUrl: string,
  body?: ActionResponseBody
) {
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf8'
    },
    body: JSON.stringify(body)
  }

  const res = await fetch(responseUrl, options)
  const resJson = await res.json()
  if (!resJson.ok) {
    console.error('error', { resJson })
  }
}

export async function postManually({
  selectedOption,
  teamId
}: {
  selectedOption: string
  teamId: TeamId
}) {
  const {
    access_token: token,
    channel_id: channel,
    attendance_blocks: blocks,
    intro_text: introText
  } = await db.getValues('teams', teamId, [
    'access_token',
    'channel_id',
    'attendance_blocks',
    'intro_text'
  ])
  const date = moment()

  switch (selectedOption) {
    case 'attendance':
      return await postAttendanceMessage({
        channel: channel as string,
        token: channel as string,
        teamId,
        blocks: blocks as string[],
        introText: introText as string,
        date
      })
    case 'rehearsal':
      date.add(4, 'days')
      return postRehearsalMusic({
        token: token as string,
        channel: channel as string,
        teamId,
        dayOfWeek: date.format('dddd'),
        date: date.format('DD/MM/YYYY'),
        isBankHoliday: false
      })
    default:
      return
  }
}
