require('dotenv').config();
const express = require('express');
const twilio = require('twilio');
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a friendly AI assistant for Vila Dan Dar apartments at Lake Dojran in Macedonia. Answer briefly and clearly, maximum 2-3 sentences. Always speak in English.

INFORMATION:
- Location: Nov Dojran, Macedonia, directly at Lake Dojran
- Open 365 days a year
- GPS: 41.2247950, 22.6995809

ROOM TYPES AND PRICES (valid all year, prices in EUR per night):
- Double room: 30 EUR
- Triple room: 40 EUR
- Quadruple room: 50 EUR
- Quintuple room: 60 EUR
- Sextuple room (entire floor): 70 EUR
- Total: 53 rooms available

AMENITIES (all rooms include):
- Air conditioning, TV, WiFi
- Kitchen, bathroom
- Pool, parking with security cameras
- Macedonian cuisine restaurant on site
- Less than 1000m from private beach
- Doctor available during the day

BOOKING CHANNELS:
- Booking.com
- Direct by phone
- WhatsApp
- Email
- Website: apartmanidojran.com

HOUSE RULES:
- Check-in: 14:00
- Check-out: 11:00
- No smoking inside
- No noise after 23:00

Always be warm and welcoming. For exact availability and reservations, direct guests to apartmanidojran.com or suggest they contact directly.`;

const conversations = {};

async function getAIResponse(callSid, userText) {
  if (!conversations[callSid]) {
    conversations[callSid] = [];
  }
  conversations[callSid].push({ role: 'user', content: userText });
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 150,
    system: SYSTEM_PROMPT,
    messages: conversations[callSid]
  });
  const aiText = response.content[0].text;
  conversations[callSid].push({ role: 'assistant', content: aiText });
  return aiText;
}

async function textToSpeech(text) {
  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`,
    {
      text: text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.6, similarity_boost: 0.8 }
    },
    {
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      responseType: 'arraybuffer'
    }
  );
  return Buffer.from(response.data);
}

app.post('/incoming-call', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const callSid = req.body.CallSid;

  try {
    const welcomeText = 'Hello! Welcome to Vila Dan Dar apartments at Lake Dojran. How can I help you today?';
    const audioBuffer = await textToSpeech(welcomeText);
    const audioBase64 = audioBuffer.toString('base64');
    twiml.play({ digits: '' }, `data:audio/mpeg;base64,${audioBase64}`);
  } catch (err) {
    twiml.say({ voice: 'Polly.Joanna' }, 'Hello! Welcome to Vila Dan Dar apartments at Lake Dojran. How can I help you today?');
  }

  twiml.gather({
    input: 'speech',
    action: `/process-speech?callSid=${callSid}`,
    language: 'en-US',
    speechTimeout: 'auto',
    timeout: 5
  });

  res.type('text/xml');
  res.send(twiml.toString());
});

app.post('/process-speech', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const callSid = req.query.callSid;
  const speechResult = req.body.SpeechResult;

  if (!speechResult) {
    twiml.say({ voice: 'Polly.Joanna' }, 'Sorry, I did not catch that. Please try again.');
    twiml.gather({
      input: 'speech',
      action: `/process-speech?callSid=${callSid}`,
      language: 'en-US',
      speechTimeout: 'auto'
    });
    res.type('text/xml');
    return res.send(twiml.toString());
  }

  try {
    const aiResponse = await getAIResponse(callSid, speechResult);

    try {
      const audioBuffer = await textToSpeech(aiResponse);
      const audioBase64 = audioBuffer.toString('base64');
      twiml.play({ digits: '' }, `data:audio/mpeg;base64,${audioBase64}`);
    } catch (err) {
      twiml.say({ voice: 'Polly.Joanna' }, aiResponse);
    }

    twiml.gather({
      input: 'speech',
      action: `/process-speech?callSid=${callSid}`,
      language: 'en-US',
      speechTimeout: 'auto',
      timeout: 5
    });

    twiml.say({ voice: 'Polly.Joanna' }, 'Thank you for calling Vila Dan Dar. Have a great day!');
    twiml.hangup();

  } catch (error) {
    console.error('Error:', error);
    twiml.say({ voice: 'Polly.Joanna' }, 'Sorry, I have a technical issue. Please try again later.');
    twiml.hangup();
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Dojran AI Assistant is running' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
