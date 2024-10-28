// GoogleSheetService.js
const axios = require("axios");
const googleServiceAccount = require("./googleserviceaccount.json"); // Import the JSON file
const { KJUR } = require("jsrsasign"); // Import jsrsasign for JWT

const TOKEN_URI = "https://oauth2.googleapis.com/token";
const SHEET_ID = "1mKEZjc89U1-8tmfPDs8004GtS-6yL9h9PfcBimuNBBk";
const SHEET_NAME = "ReelShareConfig";

class GoogleSheetService {
  constructor() {
    this.sheetId = SHEET_ID;
    this.sheetName = SHEET_NAME;
    this.accessToken = null;
    this.geminiData = null; // Store the fetched data
  }

  // Generate JWT for Google Service Account
  async generateJWT() {
    const { client_email, private_key } = googleServiceAccount;

    const now = Math.floor(Date.now() / 1000); // Current time in seconds
    const oneHour = 3600;

    // Replace '\n' in the private key with actual newlines
    const formattedPrivateKey = private_key.replace(/\\n/g, "\n");

    // Create JWT Header
    const header = {
      alg: "RS256",
      typ: "JWT",
    };

    // Create JWT Payload
    const payload = {
      iss: client_email, // Issuer from service account email
      scope: "https://www.googleapis.com/auth/spreadsheets", // Scope for Sheets API
      aud: TOKEN_URI, // Audience (Token URI)
      exp: now + oneHour, // Expiration time (1 hour from now)
      iat: now, // Issued at time
    };

    // Sign the JWT using jsrsasign
    const sHeader = JSON.stringify(header);
    const sPayload = JSON.stringify(payload);
    const jwt = KJUR.jws.JWS.sign(
      "RS256",
      sHeader,
      sPayload,
      formattedPrivateKey
    );

    return jwt;
  }

  // Exchange JWT for an access token
  async getAccessToken() {
    const jwt = await this.generateJWT();

    const response = await axios.post(TOKEN_URI, {
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    });

    if (response.data && response.data.access_token) {
      this.accessToken = response.data.access_token;
    } else {
      throw new Error("Failed to obtain access token");
    }
  }

  // Fetch all data (B1:B3) at once
  async fetchGeminiData() {
    if (!this.accessToken) {
      await this.getAccessToken(); // Ensure we have an access token
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
        apiKey: values[0] ? values[0][0] : null, // B1
        model: values[1] ? values[1][0] : null, // B2
        nodeServer: values[2] ? values[2][0] : null, // B3
      };
    } else {
      throw new Error("No data found");
    }
  }

  // API: Get the Gemini Data (API Key, Model, Node Server) after fetching it
  async getGeminiData() {
    if (!this.geminiData) {
      await this.fetchGeminiData(); // Fetch if not already fetched
    }
    return this.geminiData;
  }

  async getSunoLicenseKeys() {
    if (!this.accessToken) {
      await this.getAccessToken(); // Ensure we have an access token
    }
    const sheetName = "Suno";
    const range = `${sheetName}!A10:B`; // Start from row 10, columns A and B

    try {
      const response = await axios.get(
        `https://sheets.googleapis.com/v4/spreadsheets/${this.sheetId}/values/${range}`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`, // Use your OAuth 2.0 access token here
          },
        }
      );

      const rows = response.data.values;
      const result = [];

      // Process the rows until an empty row is encountered
      if (rows && rows.length) {
        for (const row of rows) {
          if (row[0] === "" && row[1] === "") break; // Stop if both columns are empty

          const account = row[0] || ""; // Column A
          const licenseKey = row[1] || ""; // Column B
          result.push({ account, licenseKey });
        }
      }

      return result;
    } catch (error) {
      console.error("Error reading sheet:", error);
      throw error;
    }
  }

  async setSunoActiveLicense(account, licenseKey) {
    if (!this.accessToken) {
      await this.getAccessToken(); // Ensure we have an access token
    }

    const sheetName = "Suno";
    const range = `${sheetName}!A2:B2`; // Set values in A2 and B2
    const values = [[account, licenseKey]]; // Array of arrays for the update

    try {
      await axios.put(
        `https://sheets.googleapis.com/v4/spreadsheets/${this.sheetId}/values/${range}?valueInputOption=USER_ENTERED`,
        {
          values: values,
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`, // Use your OAuth 2.0 access token here
          },
        }
      );
      console.log("Active license set successfully.");
    } catch (error) {
      console.error("Error setting active license:", error);
      throw error;
    }
  }

  async getSunoActiveLicense() {
    if (!this.accessToken) {
      await this.getAccessToken(); // Ensure we have an access token
    }

    const sheetName = "Suno";
    const range = `${sheetName}!A2:B2`; // Retrieve values from A2 and B2

    try {
      const response = await axios.get(
        `https://sheets.googleapis.com/v4/spreadsheets/${this.sheetId}/values/${range}`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`, // Use your OAuth 2.0 access token here
          },
        }
      );

      const row = response.data.values ? response.data.values[0] : [];
      const account = row[0] || ""; // Column A
      const licenseKey = row[1] || ""; // Column B

      return { account, licenseKey };
    } catch (error) {
      console.error("Error retrieving active license:", error);
      throw error;
    }
  }

  // Get value from B1
  async getSunoNodeServer() {
    if (!this.accessToken) {
      await this.getAccessToken(); // Ensure we have an access token
    }

    const sheetName = "Suno";
    const range = `${sheetName}!B1`;

    try {
      const response = await axios.get(
        `https://sheets.googleapis.com/v4/spreadsheets/${this.sheetId}/values/${range}`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        }
      );

      // Extract value from response
      const value = response.data.values ? response.data.values[0][0] : null; // Value from B1
      return value;
    } catch (error) {
      console.error(
        "Error retrieving value from B1:",
        error.response ? error.response.data : error.message
      );
      throw error;
    }
  }
}

module.exports = GoogleSheetService;
