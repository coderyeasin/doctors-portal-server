const express = require('express')
const app = express()
const cors = require('cors')
const admin = require("firebase-admin");
require('dotenv').config()
const ObjectId = require('mongodb').ObjectId;
const { MongoClient } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET)
const fileUpload = require('express-fileupload');

const port = process.env.PORT || 5000

//firebase admin connceted
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)

admin.initializeApp({ 
  credential: admin.credential.cert(serviceAccount)
});

//middleware
app.use(cors());
app.use(express.json());
app.use(fileUpload());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.yrxsm.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

// console.log('connected', uri); --you'll see db name & password if successfully connected

///////////////////////////////////Admin verify
//from db to take users, admin or not, admin can get more options users only few

async function verifyfToken(req, res, next) {
  
  if (req.headers?.authorization.startsWith('Bearer ')) {
    const token = req.headers.authorization.split(' ')[1];
    try {
      const decodedUser = await admin.auth().verifyIdToken(token);
      req.decodedEmail = decodedUser.email;
    }
    catch (error) {
      
    }
  }
  next()
}

////////////////////////////////// main function for API
async function run() {
    try {
        await client.connect();
        // console.log('cool db connected');

        const database = client.db('doctors_portal')
        const appoinmentsCollection = database.collection('appointments')
        const usersCollection = database.collection('users')
        const doctorsCollection = database.collection('doctors')
      
      app.get('/appointments', verifyfToken, async (req, res) => {
        const email = req.query.email;
        // const date = new Date(req.query.date).toLocaleDateString();
        const date = req.query.date;
        // console.log(date);
        const query = {email: email, date:date}
        // console.log(query);

        const cursor = appoinmentsCollection.find(query)
        const appoinments = await cursor.toArray()
        res.json(appoinments)
      })
      ////////////////////
      //payement
      app.get('/appointments/:id', async (req, res) => {
        const id = req.params.id
        const query = { _id: ObjectId(id) }
        const result = await appoinmentsCollection.findOne(query);
        res.json(result);
      })
////////////////////
      app.post('/appointments', async (req, res) => {
        const appoinmet = req.body;
        // console.log(appoinmet);
        const result = await appoinmentsCollection.insertOne(appoinmet)
        // console.log(result);
        res.json(result)
      })

////////////////save user payment info ///////////////
      app.put('/appointments/:id', async (req, res) => {
        const id = req.params.id;
        const payment = req.body
        const filter = { _id: ObjectId(id) }
        const updateDoc = {
          $set: {
            payment: payment
          }
        };
        const result = await appoinmentsCollection.updateOne(filter, updateDoc)
        res.json(result);
      })

///////////////////get all doctors
      app.get('/doctors', async (req, res) => {
        const cursor = doctorsCollection.find({});
        const doctors = await cursor.toArray();
        res.json(doctors);
      })


////////////////////doctor image-info/////////////////
      app.post('/doctors', async(req, res) => {
        // console.log('body', req.body);
        const name = req.body.name;
        const email = req.body.email;
        const pic = req.files.image;
        const picData = pic.data
        const encodedPic = picData.toString('base64');
        const imageBuffer = Buffer.from(encodedPic, 'base64')
        const doctor = {
          name,
          email,
          image: imageBuffer
        }
        const result = await doctorsCollection.insertOne(doctor);
        res.json(result)
      })



      // Get API for --- chk admin role
      app.get('/users/:email', async (req, res) => {
        const email = req.params.email;
        const query = { email: email }
        const user = await usersCollection.findOne(query)
        let isAdmin = false;
        if (user?.role === 'admin') {
          isAdmin = true;
        }
        res.json({ admin: isAdmin });
      })
      
      //POST API
      //save users data----save data from input field
      app.post('/users', async (req, res) => {
        const user = req.body //client theke body'r maddhome req kore data pathano hoiche
        const result = await usersCollection.insertOne(user)
        res.json(result)
        console.log(result);
      })

      //UPDATE API
      //save users data from google sign up
      app.put('/users', async (req, res) => {
        const user = req.body;
        // console.log('put', user);
        const filter = { email: user.email } //email are unique
        const options = { upsert: true }; //data thakle ignore korbe na thakle insert kore dibe etai hocche upsert
        const updateDoc = { $set: user }
        const result = await usersCollection.updateOne(filter, updateDoc, options)
        res.json(result)
      })

//users make ---admin--above the similar route that's why route name new hrere
      app.put('/users/admin', verifyfToken, async(req,res) => {
        const user = req.body; //emial ta asbe ekta object hisebe
        // console.log('put', req.headers.authorization);
        // console.log('put', req.decodedEmail);

        //user token verify
        const requester = req.decodedEmail;
        if (requester) {
          const requesterAccount = await usersCollection.findOne({ email: requester })
          if (requesterAccount.role === 'admin') {
            const filter = { email: user.email };
            const updateDoc = { $set: { role: 'admin' } };
            const result = await usersCollection.updateOne(filter, updateDoc)
            res.json(result)
          }
        }
        else {
          res.status(401).json({message: 'you don not have access to Admin'})
          }

        // const filter = { email: user.email };
        // const updateDoc = { $set: { role: 'admin' } };
        // const result = await usersCollection.updateOne(filter, updateDoc)
        // res.json(result)
      })

      //payment api

      app.post('/create-payment-intent', async (req, res) => {
        const paymentInfo = req.body;
        const amount = paymentInfo.price * 100; //---stripe always count poisa/cent
        const paymentIntent = await stripe.paymentIntents.create({
          currency: 'usd',
          amount: amount,
          payment_method_types: ['card']
        });
        res.json({clientSecret: paymentIntent.client_secret})
      })





    }
    finally {
        // await client.close()
    }
}
run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('Hello Doctors Portal')
})

app.listen(port, () => {
  console.log(`listening at ${port}`)
})
