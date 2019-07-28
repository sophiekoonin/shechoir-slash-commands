const { google } = require('googleapis')
const utils = require('../utils')
const db = require('../db')

const sheets = google.sheets('v4')
function getValuesAndFlatten(response) {
  const { values } = response.data
  return [].concat.apply([], values)
}

async function getRowNumberForDate(auth, sheetId, dateString) {
  const request = {
    auth,
    spreadsheetId: sheetId,
    range: 'A:A'
  }
  try {
    const response = await sheets.spreadsheets.values.get(request)
    const rowNumber = getValuesAndFlatten(response).indexOf(dateString) + 1
    return rowNumber > 0 ? rowNumber : 1
  } catch (err) {
    console.error(`Error getting row number: ${err}`)
    throw new Error(err)
  }
}

async function getSongDetailsFromSheet(auth, sheetId, rowNumber) {
  try {
    const response = await sheets.spreadsheets.values.get({
      auth,
      spreadsheetId: sheetId,
      range: `B${rowNumber}:I${rowNumber}`
    })
    const values = getValuesAndFlatten(response)
    const mainSong = values[0]
    const runThrough = values[1]
    const notes = values[2]
    const mainSongLink = values[6]
    const runThroughLink =
      values[1] === '' || values[1] === null
        ? `https://docs.google.com/spreadsheets/d/${sheetId}`
        : values[7]
    return {
      mainSong,
      mainSongLink,
      runThrough,
      runThroughLink,
      notes
    }
  } catch (err) {
    console.error(
      `The API returned an error when trying to get song details: ${err}`
    )
    throw new Error(err)
  }
}

exports.getNextSongs = async function(dateString) {
  const credentials = await getGoogleCreds()
  const auth = await google.auth.getClient({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    credentials
  })
  const sheetId = await utils.getDbOrConfigValue('config', 'google', 'sheet_id')
  const rowNumber = await getRowNumberForDate(auth, sheetId, dateString)
  return await getSongDetailsFromSheet(auth, sheetId, rowNumber)
}

exports.putGoogleCredentials = async function(req, res) {
  const { credentials } = req.body
  try {
    await db.updateDbValue('tokens', 'google', credentials)
    res.status(201).send('Successfully set!')
  } catch (err) {
    console.error(err)
    res.status(500).send('Error setting google credentials', err)
  }
}

exports.testGoogleIntegration = async function(req, res) {
  try {
    const sheetId = await utils.getDbOrConfigValue(
      'config',
      'google',
      'sheet_id'
    )
    const credentials = await getGoogleCreds()
    const auth = await google.auth.getClient({
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      credentials
    })
    const testDate = '04/02/2019'
    const rowNumber = await getRowNumberForDate(auth, sheetId, testDate)
    res.status(200).send(`Row number is ${rowNumber}`)
  } catch (err) {
    console.error(err)
    res.status(500).send(err)
  }
}

async function getGoogleCreds() {
  const credentials = await utils.getDocData('tokens', 'google')
  const privateKey = await utils.getDbOrConfigValue(
    'tokens',
    'google',
    'private_key'
  )
  return {
    ...credentials,
    private_key: privateKey.replace(/\\n/g, '\n')
  }
}