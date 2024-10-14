const faunadb = require('faunadb');
const nodemailer = require('nodemailer');
const aws = require('aws-sdk');

// FaunaDB client
const client = new faunadb.Client({
  secret: process.env.FAUNA_SECRET
});

const q = faunadb.query;

// Configure AWS S3
const s3 = new aws.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: 'Method Not Allowed'
    };
  }

  const form = new formidable.IncomingForm({ multiples: true });
  form.uploadDir = '/tmp';

  const formData = await new Promise((resolve, reject) => {
    form.parse(Buffer.from(event.body, 'base64'), (err, fields, files) => {
      if (err) reject(err);
      resolve({ fields, files });
    });
  });

  const data = {
    name: formData.fields.name,
    email: formData.fields.email,
    phone: formData.fields.phone,
    selectedDate: formData.fields.selectedDate,
    selectedTime: formData.fields.selectedTime,
    address: formData.fields.address,
    type: formData.fields.type,
    message: formData.fields.message,
    payment: formData.fields.payment,
    images: formData.files.images ? (Array.isArray(formData.files.images) ? formData.files.images : [formData.files.images]) : []
  };

  // Log the received data
  console.log('Received data:', data);

  // Save to FaunaDB
  try {
    const dbResponse = await client.query(
      q.Create(
        q.Collection('bookings'),
        { data }
      )
    );
    console.log('FaunaDB Response:', dbResponse);
  } catch (error) {
    console.error('FaunaDB Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: 'Failed to save booking data' })
    };
  }

  // Upload images to S3 and get URLs
  const imageUrls = [];
  for (const image of data.images) {
    const fileContent = fs.readFileSync(image.path);
    const params = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: `${Date.now()}_${image.originalFilename}`,
      Body: fileContent,
      ContentType: image.mimetype
    };

    try {
      const s3Response = await s3.upload(params).promise();
      imageUrls.push(s3Response.Location);
    } catch (error) {
      console.error('S3 Upload Error:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ success: false, error: 'Failed to upload images' })
      };
    }
  }

  // Send email using Nodemailer
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_USER,
    subject: 'New Booking',
    text: `Name: ${data.name}
Email: ${data.email}
Phone: ${data.phone}
Date: ${data.selectedDate}
Time: ${data.selectedTime}
Address: ${data.address}
Service Type: ${data.type}
Message: ${data.message}
Payment Method: ${data.payment}
Uploaded Images: ${imageUrls.join(', ')}`
  };

  try {
    const emailResponse = await transporter.sendMail(mailOptions);
    console.log('Email Response:', emailResponse);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };
  } catch (error) {
    console.error('Nodemailer Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: 'Failed to send email' })
    };
  }
};

