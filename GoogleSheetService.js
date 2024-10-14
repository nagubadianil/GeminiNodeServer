// GoogleSheetService.js
const axios = require('axios');
const googleServiceAccount = require('./googleserviceaccount.json');  // Import the JSON file
const { KJUR } = require('jsrsasign');  // Import jsrsasign for JWT

const TOKEN_URI = 'https://oauth2.googleapis.com/token';
const SHEET_ID = '1mKEZjc89U1-8tmfPDs8004GtS-6yL9h9PfcBimuNBBk';
const SHEET_NAME = 'ReelShareConfig';

class GoogleSheetService {
  constructor() {
    this.sheetId = SHEET_ID;
    this.sheetName = SHEET_NAME;
    this.accessToken = null;
    this.geminiData = null;  // Store the fetched data
  }

  // Generate JWT for Google Service Account
  async generateJWT() {
    const { client_email, private_key } = googleServiceAccount;

    const now = Math.floor(Date.now() / 1000);  // Current time in seconds
    const oneHour = 3600;

    // Replace '\n' in the private key with actual newlines
    const formattedPrivateKey = private_key.replace(/\\n/g, '\n');

    // Create JWT Header
    const header = {
      alg: 'RS256',
      typ: 'JWT',
    };

    // Create JWT Payload
    const payload = {
      iss: client_email,  // Issuer from service account email
      scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',  // Scope for Sheets API
      aud: TOKEN_URI,  // Audience (Token URI)
      exp: now + oneHour,  // Expiration time (1 hour from now)
      iat: now,  // Issued at time
    };

    // Sign the JWT using jsrsasign
    const sHeader = JSON.stringify(header);
    const sPayload = JSON.stringify(payload);
    const jwt = KJUR.jws.JWS.sign('RS256', sHeader, sPayload, formattedPrivateKey);

    return jwt;
  }

  // Exchange JWT for an access token
  async getAccessToken() {
    const jwt = await this.generateJWT();

    const response = await axios.post(TOKEN_URI, {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    });

    if (response.data && response.data.access_token) {
      this.accessToken = response.data.access_token;
    } else {
      throw new Error('Failed to obtain access token');
    }
  }

  // Fetch all data (B1:B3) at once
  async fetchGeminiData() {
    if (!this.accessToken) {
      await this.getAccessToken();  // Ensure we have an access token
    }

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.sheetId}/values/${this.sheetName}!B1:B3`;

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (response.data && response.data.values) {
      const values = response.data.values;
      // Store the results in an object
      this.geminiData = {
        apiKey: values[0] ? values[0][0] : null,  // B1
        model: values[1] ? values[1][0] : null,   // B2
        nodeServer: values[2] ? values[2][0] : null,  // B3
      };
    } else {
      throw new Error('No data found');
    }
  }

  // API: Get the Gemini Data (API Key, Model, Node Server) after fetching it
  async getGeminiData() {
    if (!this.geminiData) {
      await this.fetchGeminiData();  // Fetch if not already fetched
    }
    return this.geminiData;
  }
}

module.exports = GoogleSheetService;
