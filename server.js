const express = require("express");
const multer = require("multer");
const axios = require("axios");
const fs = require('fs');
const path = require('path');
const os = require('os');
const ytdl = require("ytdl-core"); // Require at the top
const crypto = require('crypto'); // For generating random data

const { GoogleAIFileManager, GoogleAICacheManager, FileState } = require("@google/generative-ai/server");
require("dotenv").config();
const bodyParser = require('body-parser');
const GoogleSheetService = require('./GoogleSheetService'); 
const sheetService = new GoogleSheetService()
let gemini = null
let fileManager = null
let cacheManager = null

const app = express();
const PORT = process.env.PORT || 3000;


const cors = require('cors');
app.use(cors());

app.use(express.json()); // This will parse JSON request bodies
// Setup for handling file uploads using multer
const upload = multer({ dest: "uploads/" });


initGemini()

async function initGemini() {
    gemini = await sheetService.getGeminiData();
    //console.log("initGemini: ", JSON.stringify(gemini,null,2))
    fileManager = new GoogleAIFileManager(gemini.apiKey);
    cacheManager = new GoogleAICacheManager(gemini.apiKey);
}



// Helper function to check file upload status
async function checkFileStatus(fileName) {
  let fileStatus;
  do {
    fileStatus = await fileManager.getFile(fileName);
    console.log('checkFileStatus Current file status:', fileStatus.state); // Log the current status
    await new Promise(resolve => setTimeout(resolve, 2000));        
  } while (fileStatus.state == FileState.PROCESSING);
  return fileStatus;
}

app.get('/', (req, res) => {
    console.log("received / get request")

    const sampleData = {
      message: 'This is dummy message',
      data: [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' }
      ]
    };
  
    res.json(sampleData);
  });

app.post('/createCache', async (req, res) => {
    const data = req.body;
    console.log('Received data:', data);

    const cacheResult = await cacheManager.create(data);

    console.log("createCache cacheResult:", JSON.stringify(cacheResult, null, 2))

    res.json({
       cacheName: cacheResult.name,
      })
});

// Endpoint to upload a local video
app.post(
  "/uploadLocalVideoToGemini",
  upload.single("video"),
  async (req, res) => {

    console.log("/uploadLocalVideoToGemini received");
    console.log("Uploaded File: ", req.file)

    try {
     const video = req.file;
     const uploadResult = await fileManager.uploadFile(
        video.path,
        { mimeType: video.mimetype }
      );

      console.log("uploadLocalVideoToGemini fileManager.uploadFile finished. uploadResult:", uploadResult)
      const fileStatus = await checkFileStatus(uploadResult.file.name);
      console.log("uploadLocalVideoToGemini fileStatus:", fileStatus)
    
      if (fileStatus.state === FileState.FAILED) {
        throw new Error("Video processing failed.");
      }
    
      res.json({
        fileData: {
          fileUri:  uploadResult.file.uri,
          mimeType: uploadResult.file.mimeType,
        },
      });
    } catch (error) {
        console.log("uploadLocalVideoToGemini Excepition occured: ", error)
      res.status(500).send(error.message);
    }
  }
);


// Endpoint to upload a local image
app.post(
    "/uploadLocalImageToGemini",
    upload.single("image"),
    async (req, res) => {
      try {
        console.log("/uploadLocalImageToGemini received");
        console.log("Uploaded File: ", req.file)

        const image = req.file;
        const uploadResult = await fileManager.uploadFile(
          image.path,
          { mimeType: image.mimetype }
        );

        console.log("uploadLocalImageToGemini fileManager.uploadFile finished. uploadResult:", uploadResult)
        const fileStatus = await checkFileStatus(uploadResult.file.name)
        console.log("uploadLocalImageToGemini fileStatus:", fileStatus)

        if (fileStatus.state === FileState.FAILED) {
            throw new Error("Image processing failed.");
          }

        res.json({
          fileData: {
            fileUri: uploadResult.file.uri,
            mimeType: uploadResult.file.mimeType,
          },
        });
      } catch (error) {

        console.log("uploadLocalImageToGemini Excepition occured: ", error)
        res.status(500).send(error.message);
      }
    }
  );

// Endpoint to upload any local file
app.post(
    "/uploadLocalFileToGemini",
    upload.single("file"),
    async (req, res) => {
      try {
        console.log("/uploadLocalFileToGemini received");
        console.log("Uploaded File: ", req.file)

        const file = req.file;
        const uploadResult = await fileManager.uploadFile(
          file.path,
          { mimeType: file.mimetype }
        );
        console.log("uploadLocalFileToGemini fileManager.uploadFile finished. uploadResult:", uploadResult)
        const fileStatus = await checkFileStatus(uploadResult.file.name);
        console.log("uploadLocalFileToGemini fileStatus:", fileStatus)

        if (fileStatus.state === FileState.FAILED) {
            throw new Error("File processing failed.");
          }
        
        res.json({
          fileData: {
            fileUri: uploadResult.file.uri,
            mimeType: uploadResult.file.mimeType,
          },
        });
      } catch (error) {
        console.log("uploadLocalFileToGemini Excepition occured: ", error)
        res.status(500).send(error.message);
      }
    }
  );


  app.post('/uploadWebURIFileToGemini', async (req, res) => {
    const { fileUrl } = req.body; // Get the file URL from the request body

    // Check if fileUrl is provided
    if (!fileUrl) {
        console.error('Error: No file URL provided');
        return res.status(400).json({ error: 'No file URL provided' });
    }

    try {
        console.log(`Downloading file from URL: ${fileUrl}`);

        // Download the file
        const response = await axios.get(fileUrl, { responseType: 'stream' });

        // Create a temporary file path
        const tempFilePath = path.join(os.tmpdir(), path.basename(fileUrl));
        console.log(`Temporary file will be saved to: ${tempFilePath}`);

        // Pipe the response data to the temporary file
        const writer = fs.createWriteStream(tempFilePath);
        response.data.pipe(writer);

        // Wait for the file to be fully written
        writer.on('finish', async () => {
            console.log('File downloaded successfully. Starting upload...');

            try {
                // Now upload the file using fileManager
                const uploadResult = await fileManager.uploadFile(tempFilePath, {
                    mimeType: response.headers['content-type'],
                });
                console.log('File uploaded successfully:', uploadResult);

                // Check the file status
                const fileStatus = await checkFileStatus(uploadResult.file.name);
                console.log('File status checked successfully:', fileStatus);

                // Respond with file information
                res.json({
                    fileData: {
                        fileUri: uploadResult.file.uri,
                        mimeType: uploadResult.file.mimeType,
                    },
                });
            } catch (uploadError) {
                console.error('Error during file upload:', uploadError);
                return res.status(500).json({ error: 'File upload failed' });
            } finally {
                // Clean up the temporary file
                fs.unlinkSync(tempFilePath); // Remove the temporary file after uploading
                console.log(`Temporary file removed: ${tempFilePath}`);
            }
        });

        // Handle stream errors
        writer.on('error', (streamError) => {
            console.error('Error writing file:', streamError);
            return res.status(500).json({ error: 'Failed to download file' });
        });
    } catch (error) {
        console.error('Error downloading file:', error);
        return res.status(500).json({ error: 'Failed to download file' });
    }
});
  
// Endpoint to upload a YouTube video to Gemini
function sanitizeFileName(fileName) {
    return fileName
        .replace(/[<>:"/\\|?*]+/g, '_') // Replace invalid characters with an underscore
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .slice(0, 255); // Limit to 255 characters for the file name
}


function generateRandomString() {
    return crypto.randomBytes(8).toString('hex'); // Generates a random 16-character string
}

app.post("/uploadYouTubeVideoToGemini", async (req, res) => {
    const { youtubeUrl } = req.body;

    // Check if youtubeUrl is provided
    if (!youtubeUrl) {
        console.error('Error: No YouTube URL provided');
        return res.status(400).json({ error: 'No YouTube URL provided' });
    }

    console.log(`Downloading YouTube video from URL: ${youtubeUrl}`);

    try {
        // Sanitize the filename and add random data
        const sanitizedFileName = sanitizeFileName(path.basename(youtubeUrl)) + `_${generateRandomString()}.mp4`;
        const tempFilePath = path.join(os.tmpdir(), sanitizedFileName);
        console.log(`Temporary file will be saved to: ${tempFilePath}`);

        // Use ytdl-core to download YouTube videos as a stream
        const videoStream = ytdl(youtubeUrl, { filter: "audioandvideo" });
        const writer = fs.createWriteStream(tempFilePath);

        // Track progress manually using the 'data' event
        let downloadedBytes = 0;

        // When data is received, log progress
        videoStream.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            console.log(`Downloaded ${downloadedBytes} bytes`);
        });

        // Log the start and end of the stream
        videoStream.on('start', () => {
            console.log('Started downloading the video');
        });

        videoStream.on('end', () => {
            console.log('Finished downloading the video');
        });

        // Handle video stream errors
        videoStream.on('error', (error) => {
            console.error('Error in video stream:', error);
            return res.status(500).json({ error: 'Failed to download video stream' });
        });

        // Pipe the video stream to the temporary file
        videoStream.pipe(writer);

        writer.on('finish', async () => {
            console.log('Video downloaded successfully. Starting upload...');

            try {
                // Upload the downloaded video file
                const uploadResult = await fileManager.uploadFile(tempFilePath, {
                    mimeType: 'video/mp4',
                });
                console.log('Video uploaded successfully:', uploadResult);

                // Check the file status
                const fileStatus = await checkFileStatus(uploadResult.file.name);
                console.log('File status checked successfully:', fileStatus);

                // Respond with file information
                res.json({
                    fileData: {
                        fileUri: fileStatus.uri,
                        mimeType: fileStatus.mimeType,
                    },
                });
            } catch (uploadError) {
                console.error('Error during file upload:', uploadError);
                return res.status(500).json({ error: 'File upload failed' });
            } finally {
                // Clean up the temporary file
                fs.unlinkSync(tempFilePath); // Remove the temporary file after uploading
                console.log(`Temporary file removed: ${tempFilePath}`);
            }
        });

        // Handle writer stream errors
        writer.on('error', (streamError) => {
            console.error('Error writing video file:', streamError);
            return res.status(500).json({ error: 'Failed to download video' });
        });

    } catch (error) {
        console.error('Error during YouTube video download:', error);
        return res.status(500).json({ error: 'Failed to download video' });
    }
});


// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
