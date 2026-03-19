require('dotenv').config();
const express = require('express');
const twilio = require('twilio');
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Ти си топол и пријателски AI асистент за Вила Дан Дар апартмани на Дојранско Езеро во Македонија. Секогаш зборуваш на македонски јазик. Одговараш кратко и јасно, максимум 2-3 реченици. Биди топол, гостопримлив и пријателски — како да зборуваш со пријател.

ИНФОРМАЦИИ:
- Локација: Нов Дојран, Македонија, директно на Дојранско Езеро
- Отворено 365 дена годишно
- GPS: 41.2247950, 22.6995809
- На помалку од 1000м од приватна плажа

ТИПОВИ СОБИ И ЦЕНИ (важат цела година, цени во EUR по ноќ):
- Двокреветна соба: 30 EUR
- Трокреветна соба: 40 EUR
- Четворокреветна соба: 50 EUR
- Петокреветна соба: 60 EUR
- Шестокреветна соба (цел спрат): 70 EUR
- Вкупно: 53 соби

ОПРЕМА (сите соби вклучуваат):
- Клима уред, ТВ, WiFi
- Кујна, бања
- Базен, паркинг со безбедносни камери
- Ресторан на македонска кујна
- Доктор на располагање во текот на денот

РЕЗЕРВАЦИИ:
- Booking.com
- Директно по телефон
- WhatsApp
- Email
- Веб страна: apartmanidojran.com

ПРАВИЛА:
- Пријавување: 14:00
- Одјавување: 11:00
- Забрането пушење внатре
- Забранета бука после 23:00

За резервации и достапност упатувај ги гостите на apartmanidojran.com или да контактираат директно. Секогаш завршувај со топла покана да дојдат!`;

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
      voice_settings: { stability: 0.5, similarity_boost: 0.85 }
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
    const welcomeText = 'Здраво! Добредојдовте во Вила Дан Дар на Дојранско Езеро. Со што можам да ви помогнам денес?';
    const audioBuffer = await textToSpeech(welcomeText);
    const audioBase64 = audioBuffer.toString('base64');
    twiml.play({ digits: '' }, `data:audio/mpeg;base64,${audioBase64}`);
  } catch (err) {
    twiml.say({ voice: 'Polly.Maja' }, 'Zdravo! Dobrodosli vo Vila Dan Dar na Dojransko Ezero.');
  }

  twiml.gather({
    input: 'speech',
    action: `/process-speech?callSid=${callSid}`,
    language: 'mk-MK',
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
    twiml.say({ voice: 'Polly.Maja' }, 'Извинете, не ве разбрав. Обидете се повторно.');
    twiml.gather({
      input: 'speech',
      action: `/process-speech?callSid=${callSid}`,
      language: 'mk-MK',
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
      twiml.say({ voice: 'Polly.Maja' }, aiResponse);
    }

    twiml.gather({
      input: 'speech',
      action: `/process-speech?callSid=${callSid}`,
      language: 'mk-MK',
      speechTimeout: 'auto',
      timeout: 5
    });

    twiml.say({ voice: 'Polly.Maja' }, 'Благодариме што не контактиравте. Добредојдовте во Вила Дан Дар!');
    twiml.hangup();

  } catch (error) {
    console.error('Error:', error);
    twiml.say({ voice: 'Polly.Maja' }, 'Извинете, имам технички проблем. Обидете се подоцна.');
    twiml.hangup();
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Dojran AI Assistant e aktiven!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serverot raboti na port ${PORT}`);
});
