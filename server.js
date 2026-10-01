import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

// Подключаем Qwen через OpenRouter
const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Отдаем файлы из папки public
app.use(express.static('public'));

// База данных в оперативной памяти (исчезнет при перезапуске)
const players = {};
let currentQuestion = null;

io.on('connection', (socket) => {
  console.log('Новое подключение:', socket.id);

  // Игрок входит в игру
  socket.on('join_game', (name) => {
    players[socket.id] = { id: socket.id, name, level: 1, xp: 0, gold: 0 };
    io.emit('update_players', Object.values(players));
    if (currentQuestion) socket.emit('new_question', currentQuestion);
  });

  // Запрос нового вопроса у ИИ
  socket.on('generate_question', async () => {
    io.emit('system_message', 'ИИ генерирует вопрос...');
    try {
      const completion = await openai.chat.completions.create({
        model: "qwen/qwen-2.5-72b-instruct", // Бесплатная мощная модель Qwen
        messages: [{
          role: "user",
          content: "Создай один интересный вопрос для викторины. Верни ТОЛЬКО JSON в формате: {\"question\": \"текст вопроса\", \"options\": [\"вар1\", \"вар2\", \"вар3\", \"вар4\"], \"correctIndex\": 0-3}"
        }]
      });
      
      const jsonStr = completion.choices[0].message.content.replace(/```json|```/g, '');
      currentQuestion = JSON.parse(jsonStr);
      io.emit('new_question', currentQuestion);
      
    } catch (error) {
      console.error(error);
      io.emit('system_message', 'Ошибка генерации вопроса. Попробуйте еще раз.');
    }
  });

  // Обработка ответа игрока
  socket.on('answer', (answerIndex) => {
    const player = players[socket.id];
    if (!player || !currentQuestion) return;

    if (answerIndex === currentQuestion.correctIndex) {
      player.xp += 50;
      player.gold += 10;
      // Логика повышения уровня
      if (player.xp >= player.level * 100) {
        player.xp = 0;
        player.level += 1;
        io.emit('system_message', `${player.name} получил уровень ${player.level}!`);
      }
    } else {
      player.gold = Math.max(0, player.gold - 5); // Штраф за ошибку
    }
    
    io.emit('update_players', Object.values(players));
  });

  // Отключение игрока
  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('update_players', Object.values(players));
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});
