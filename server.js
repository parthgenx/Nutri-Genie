const express = require('express');
const { MongoClient } = require('mongodb');
require('dotenv').config(); // Loads environment variables
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
const app = express();
const port = 3000;
const session = require('express-session');

// 1. Middleware Setup
app.use(express.urlencoded({ extended: true })); // Allows us to read form data
app.use(express.static('public')); // Serves your CSS and images
app.set('view engine', 'ejs'); // Tells Express to look for .ejs files in /views
app.use(session({
  secret: 'nutrigenie-hackathon-secret', // A secret key to sign the session ID cookie
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true if using HTTPS
}));

const requireLogin = (req, res, next) => {
  if (!req.session.userId) {
    return res.redirect('/login'); // If not logged in, go to Login/Input page
  }
  next();
};

// 2. Database Connection Setup
const uri = process.env.MONGODB_URI; // Gets the secret key from .env
const client = new MongoClient(uri);
let db;

async function connectDB() {
  try {
    await client.connect();
    console.log("✅ Connected successfully to MongoDB");
    db = client.db("NutriGenie");
  } catch (e) {
    console.error("❌ Connection error:", e);
  }
}

app.get('/', (req, res) => {
    res.render('home'); // Renders the new marketing page
});

// 3. Basic Route
app.get('/new', (req, res) => {
  res.render('index');
});

app.post('/submit', async(req,res) =>{
    const { age, weight, height, gender, activity, goal } = req.body;
    const prompt = `
    Act as a professional expert nutritionist and personal trainer.
    I am a ${age} year old ${gender}.
    My stats: Height: ${height}cm, Weight: ${weight}kg.
    Activity Level: ${activity}.
    My Goal: ${goal}.

    Based on this, please generate:
    1. A calculation of my BMR and TDEE (calories).
    2. A strictly structured weekly diet plan (Breakfast, Lunch, Snack, Dinner).
    3. A specific workout recommendation.
    
    IMPORTANT: Format your response using HTML tags (like <h3> for headings, <ul> for lists, <b> for bold) so I can display it directly on a website. Do not use markdown (like ** or #), use HTML tags only.
  `;

    try {
    // 3. Send to Gemini
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();


    // Create the object to save
    const saveData = {
        ...req.body,          // 1. Unpacks age, weight, height, etc.
        aiReport: text,       // 2. Adds the AI's response
        createdAt: new Date() // 3. Adds the current time
    };

    console.log("💾 Data ready to save:", saveData); // Optional: Check your terminal
    await db.collection('plans').insertOne(saveData);


    console.log("🤖 AI Response generated!");
    
    // 4. Send the result back to the user (We'll fix this UI in a second)
    res.render('result', { report: text }); 

  } catch (error) {
    console.error(error);
    res.send("❌ Something went wrong with the AI. Please try again.");
  }
}) 

// 5. Dashboard Route
app.get('/dashboard',requireLogin, async (req, res) => {
  // We will fetch data here in a second
  const plans = await db.collection('plans').find().toArray();
  res.render('dashboard', { plans: plans }); 
});

// 6. Delete a Plan (Simpler Feature)
const { ObjectId } = require('mongodb'); // Keep this import!

app.post('/delete-plan', async (req, res) => {
  const id = req.body.planId; // We get the ID from a hidden form input
  
  await db.collection('plans').deleteOne({ _id: new ObjectId(id) });
  
  res.redirect('/dashboard'); // Refresh the page to show it's gone
});

// Show the Login Page
app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;

    // Hackathon Auth: Just check if they typed something!
    // (In a real app, you'd check the database here)
    if (username && password) {
        
        // 1. Start the Session 🔐
        req.session.userId = username; 
        
        // 2. Redirect to the Dashboard 🚀
        res.redirect('/dashboard');
        
    } else {
        // If they left fields empty, just reload the login page
        res.redirect('/new'); 
    }
});

// Start server
connectDB().then(() => {
  app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
  });
});