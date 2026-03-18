require('dotenv').config();
const express = require('express');
const twilio = require('twilio');
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Ti si AI asistent za Vila Dan Dar apartmani na Dojransko Ezero vo Makedonija. Odgovaras kratko i jasno, maksimum 2-3 recenici. Zboruvas na makedonski ili srpski jazik zavisno od gostinot.

INFORMACII:
- 53 sobi: dvokreventi, trokreventi, cetvorokreventi, petokreventi, sestokreveten
- Ceni: od 30-60 EUR za sezona (juni-septemvri), popust van sezona
- Oprema: klima, TV, WiFi, kujna, banja
- Bazen, parking, restoran na makedonska kujna
- Otvoreno 365 dena
- Lokacija: Nov Dojran, GPS 41.2247950, 22.6995809
- Check-in: 14:00, Check-out: 11:00
- Kontakt za rezervacija: apartmanidojran.com

Za rezervacija i tocni ceni, upatuvaj gostite da kontaktiraat direktno.`;

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
    'https://api.elevenlabs.io/v1/text-to-speech/ТВОЈОТ_VOICE_ID',
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
  return Buffer.from(response.data).toString('base64');
}

app.post('/incoming-call', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const callSid = req.body.CallSid;
  
  twiml.say({
   voice: 'Polly.Joanna',
language: 'en-US'
  }, 'Zdravo! Dobrodosli vo Vila Dan Dar na Dojransko Ezero. Kako mozam da vi pomognam?');
  
  const gather = twiml.gather({
    input: 'speech',
    action: `/process-speech?callSid=${callSid}`,
    language: 'sr-RS',
    speechTimeout: 'auto',
    timeout: 5
  });
  
  gather.say({ voice: 'Polly.Maja', language: 'sr-RS' }, 'Prasajte me za ceni, smeshtaj ili rezervacii.');
  
  res.type('text/xml');
  res.send(twiml.toString());
});

app.post('/process-speech', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const callSid = req.query.callSid;
  const speechResult = req.body.SpeechResult;
  
  if (!speechResult) {
    twiml.say({ voice: 'Polly.Maja', language: 'sr-RS' }, 'Izvinete, ne ve razbrav. Obidete se povtorno.');
    twiml.gather({
      input: 'speech',
      action: `/process-speech?callSid=${callSid}`,
      language: 'sr-RS',
      speechTimeout: 'auto'
    });
    res.type('text/xml');
    return res.send(twiml.toString());
  }
  
  try {
    const aiResponse = await getAIResponse(callSid, speechResult);
    
    twiml.say({ voice: 'Polly.Joanna',
language: 'en-US' }, aiResponse);
    
    const gather = twiml.gather({
      input: 'speech',
      action: `/process-speech?callSid=${callSid}`,
      language: 'sr-RS',
      speechTimeout: 'auto',
      timeout: 5
    });
    
    gather.say({ voice: 'Polly.Joanna',
language: 'en-US' }, 'Imate li ushte prasanja?');
    
    twiml.say({ voice: 'Polly.Joanna',
language: 'en-US' }, 'Blagodarime sto ne kontaktiravte. Dobrodojdete vo Vila Dan Dar!');
    twiml.hangup();
    
  } catch (error) {
    console.error('Error:', error);
    twiml.say({ voice: 'Polly.Joanna',
language: 'en-US' }, 'Izvinete, imam tehnicki problem. Obidete se podocna.');
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
