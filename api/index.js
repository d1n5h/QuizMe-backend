// mongodb+srv://dinesh:Dinesh@cluster0.vhh08.mongodb.net/

// /api/index.js
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

let correctAnswers = [];

// Connect to MongoDB (Replace 'localhost' with the actual MongoDB connection URL if you're using an external DB)
mongoose.connect('mongodb+srv://dinesh:Dinesh@cluster0.vhh08.mongodb.net/', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('MongoDB connected');
    initializeDummyUser();  // Initialize dummy user after connection
}).catch(err => console.log("Error connecting to MongoDB: " + err));

// User Model
const UserSchema = new mongoose.Schema({
    username: String,
    password: String,
    scores: [
        {
            topic: String,
            score: Number,
            totalQuestions: Number,
            date: { type: Date, default: Date.now }
        }
    ]
});

const User = mongoose.model('User', UserSchema);

// Function to initialize dummy user
const initializeDummyUser = async () => {
    try {
        const existingUser = await User.findOne({ username: 'abcd' });
        if (!existingUser) {
            const dummyUser = new User({ username: 'abcd', password: '1234' });
            await dummyUser.save();
            console.log('Dummy user created');
        } else {
            console.log('Dummy user already exists');
        }
    } catch (error) {
        console.error('Error initializing dummy user:', error);
    }
};

// Authentication Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401);

    jwt.verify(token,  process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// Login Route
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ username, password });
        if (!user) return res.status(401).send('Invalid credentials');

        const token = jwt.sign({ username: user.username },  process.env.JWT_SECRET);
        res.json({ token });
    } catch (error) {
        res.status(500).send('Server error');
    }
});

// Load Quiz Route (Gemini)
app.post('/api/quiz/:topic', async (req, res) => {
    const topic = req.params.topic;
    const inputText = topic;

    try {

        const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`, {
            contents: [
                {
                    parts: [
                        {
                           text: `The following is the input text: ${inputText}. Generate 4 true/false quiz questions with correct answers. Respond only with a well-formatted JSON object in the following format: {"quiz": [{"question": "Question 1?", "answer": "true/false"}, {"question": "Question 2?", "answer": "true/false"}, ...]}. Ensure that the response is valid JSON with no additional text or characters.`
                        }
                    ]
                }
            ]
        });

        
    // const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    //     contents: [
    //         {
    //             parts: [
    //                 {
    //                     text: `The following is the input text: ${inputText}. Generate 4 true/false quiz questions with correct answers. Respond only with a well-formatted JSON object in the following format: {"quiz": [{"question": "Question 1?", "answer": "true/false"}, {"question": "Question 2?", "answer": "true/false"}, ...]}. Ensure that the response is valid JSON with no additional text or characters.`
    //                 }
    //             ]
    //         }
    //     ]
    // });

        const quizText = response.data.candidates[0].content.parts[0].text;
        const quizData = JSON.parse(quizText);
        correctAnswers = quizData.quiz.map(q => q.answer === 'true');
        res.json({ quiz: quizData });

    } catch (error) {
        console.error('Error generating quiz:', error);
        res.status(500).send('Failed to generate quiz');
       
    }
});

// Submit Quiz Route
app.post('/api/submit-quiz', authenticateToken, async (req, res) => {
    const userAnswers = req.body.answers;
    const username = req.user.username;

    if (!userAnswers || !Array.isArray(userAnswers)) return res.status(400).send('Invalid answers format');

    let score = 0;
    userAnswers.forEach((userAnswer) => {
        const questionIndex = parseInt(userAnswer.questionIndex, 10);
        const userAnswerValue = userAnswer.answer === 'true';
        if (correctAnswers[questionIndex] === userAnswerValue) score++;
    });

    try {
        const user = await User.findOneAndUpdate(
            { username },
            {
                $push: {
                    scores: {
                        topic: req.body.topic,
                        score: score,
                        totalQuestions: correctAnswers.length
                    }
                }
            },
            { new: true }
        );

        if (!user) return res.status(404).send('User not found');
        res.json({ score: score, totalQuestions: correctAnswers.length });
    } catch (error) {
        res.status(500).send('Server error');
    }
});

module.exports = app;
