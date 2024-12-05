import express from 'express';
import fileUpload from 'express-fileupload';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 4000;


const hfToken = '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'; 
const modelUrl = 'https://api-inference.huggingface.co/models/linkanjarad/mobilenet_v2_1.0_224-plant-disease-identification';


app.use(fileUpload());


app.use(express.static(path.join(__dirname, '../public')));


app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'diagnosis.html'));
});


const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'data.json'), 'utf-8'));


const callHuggingFaceAPI = async (imageBuffer, retries = 3, delay = 5000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    console.log(`Attempt ${attempt}: Sending request to Hugging Face API...`);
    const response = await fetch(modelUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${hfToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: imageBuffer.toString('base64'),
      }),
    });

    if (response.ok) {
      console.log("Hugging Face API request successful.");
      return await response.json();
    } else {
      const errorText = await response.text();
      console.log(`Hugging Face API response: ${errorText}`);

      const error = JSON.parse(errorText);
      if (response.status === 503 && error.error.includes('currently loading')) {
        console.log(
          `Model is loading. Retrying in ${delay / 1000} seconds... (Attempt ${attempt}/${retries})`
        );
        await new Promise(resolve => setTimeout(resolve, delay)); 
      } else {
        throw new Error(
          `Error calling Hugging Face API: ${response.status} - ${error.error}`
        );
      }
    }
  }

  throw new Error('Hugging Face API is unavailable after retries.');
};


app.post('/diagnose', async (req, res) => {
  if (!req.files || !req.files.image) {
    return res.status(400).send('No image uploaded.');
  }

  const imageFile = req.files.image;
  const uploadDir = path.join(__dirname, '../uploads');

  try {
    
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }

    const imagePath = path.join(uploadDir, imageFile.name);

    
    await imageFile.mv(imagePath);

    console.log('Sending image to Hugging Face API...');

    try {
      const imageBuffer = fs.readFileSync(imagePath);
      const result = await callHuggingFaceAPI(imageBuffer);

      const prediction = result[0]; 


      const diseaseDetails = data[prediction.label] || {};

      res.json({
        label: prediction.label,
        score: prediction.score,
        diseaseDetails,
      });
    } catch (error) {
      console.error(error.message);
      res.status(500).send(error.message);
    }
  } catch (err) {
    console.error('Error handling file upload:', err);
    res.status(500).send('Failed to process the image.');
  }
});


app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
