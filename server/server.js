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
const plantValidationModelUrl = 'https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-large';
const diseaseDiagnosisModelUrl = 'https://api-inference.huggingface.co/models/linkanjarad/mobilenet_v2_1.0_224-plant-disease-identification';

app.use(fileUpload());
app.use(express.static(path.join(__dirname, '../public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'diagnosis.html'));
});

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'data.json'), 'utf-8'));

const callHuggingFaceAPI = async (modelUrl, imageBuffer, retries = 3, delay = 1000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    console.log(`Attempt ${attempt}: Sending request to Hugging Face API...`);
    try {
      const response = await fetch(modelUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${hfToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: imageBuffer.toString('base64') }),
      });

      if (response.ok) {
        console.log('Hugging Face API request successful.');
        return await response.json();
      } else {
        const errorText = await response.text();
        console.error(`Hugging Face API response: ${errorText}`);
        if (response.status === 503 && attempt < retries) {
          console.log(`Retrying in ${delay / 1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw new Error(`Hugging Face API error: ${response.statusText}`);
        }
      }
    } catch (error) {
      console.error(`Attempt ${attempt} failed: ${error.message}`);
      if (attempt === retries) throw error;
    }
  }
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
  
      const imageBuffer = fs.readFileSync(imagePath);
  
      console.log('Step 1: Validating the image...');
      const validationResponse = await callHuggingFaceAPI(plantValidationModelUrl, imageBuffer);
  
      if (
        validationResponse &&
        Array.isArray(validationResponse) &&
        validationResponse[0] &&
        validationResponse[0].generated_text &&
        (validationResponse[0].generated_text.toLowerCase().includes('plant') ||
          validationResponse[0].generated_text.toLowerCase().includes('leaf'))
      ) {
        console.log('Step 2: Diagnosing the plant disease...');
        const diagnosisResponse = await callHuggingFaceAPI(diseaseDiagnosisModelUrl, imageBuffer);
  
        if (
          diagnosisResponse &&
          Array.isArray(diagnosisResponse) &&
          diagnosisResponse[0] &&
          diagnosisResponse[0].label
        ) {
          const prediction = diagnosisResponse[0];
          const diseaseDetails = data[prediction.label] || {};
  
          return res.json({
            label: prediction.label,
            score: prediction.score,
            diseaseDetails,
          });
        } else {
          console.error('Diagnosis model returned an unexpected response:', diagnosisResponse);
          return res.status(500).send('Unexpected response from the disease diagnosis model.');
        }
      } else {
        console.error('Validation model response:', validationResponse);
        return res.status(400).send('Please upload an image of leaf');
      }
    } catch (err) {
      console.error('Error during processing:', err.message);
      res.status(500).send('Something went wrong while processing the image.');
    }
  });
  

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
