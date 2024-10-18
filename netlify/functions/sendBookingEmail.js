const faunadb = require('faunadb');
const nodemailer = require('nodemailer');
const formidable = require('formidable');
const { Readable } = require('stream');

// FaunaDB client
const client = new faunadb.Client({ secret: process.env.FAUNA_SECRET });
const q = faunadb.query;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: 'Method Not Allowed'
    };
  }

  const form = new formidable.IncomingForm();

  // Create a stream from the event body
  const stream = new Readable();
  stream._read = () => {}; // No-op
  stream.push(Buffer.from(event.body, 'base64'));
  stream.push(null);

  // Add content-length header manually
  const headers = {
    ...event.headers,
    'content-length': Buffer.from(event.body, 'base64').length
  };

  return new Promise((resolve, reject) => {
    form.parse({ headers, stream }, async (err, fields, files) => {
      if (err) {
        console.error('Form parse error:', err);
        resolve({
          statusCode: 500,
          body: JSON.stringify({ success: false, error: 'Failed to parse form data' })
        });
        return;
      }

      // Log the received data
      console.log('Received data:', fields);

      // Save to FaunaDB
      try {
        const dbResponse = await client.query(
          q.Create(
            q.Collection('bookings'), // Ensure this matches your collection name exactly
            { data: fields }
          )
        );
        console.log('FaunaDB Response:', dbResponse);
      } catch (error) {
        console.error('FaunaDB Error:', error);
        resolve({
          statusCode: 500,
          body: JSON.stringify({ success: false, error: 'Failed to save booking data' })
        });
        return;
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
        text: `Name: ${fields.name}\nEmail: ${fields.email}\nPhone: ${fields.phone}\nDate: ${fields.selectedDate}\nTime: ${fields.selectedTime}\nAddress: ${fields.address}\nService Type: ${fields.type}\nMessage: ${fields.message}\nPayment Method: ${fields.payment}\nUploaded Images: ${Object.keys(files).length > 0 ? Object.keys(files).map(key => files[key].name).join(', ') : 'None'}`,
        attachments: Object.keys(files).map(key => ({
          filename: files[key].name,
          content: files[key].content
        }))
      };

      try {
        const emailResponse = await transporter.sendMail(mailOptions);
        console.log('Email Response:', emailResponse);
        resolve({
          statusCode: 200,
          body: JSON.stringify({ success: true })
        });
      } catch (error) {
        console.error('Nodemailer Error:', error);
        resolve({
          statusCode: 500,
          body: JSON.stringify({ success: false, error: 'Failed to send email' })
        });
      }
    });
  });
};
