/**
 * Test script for /api/v1/auth/request-otp endpoint
 * Usage: node test-request-otp.js
 */

const axios = require('axios');

const testRequestOTP = async () => {
  try {
    console.log('🧪 Testing /api/v1/auth/request-otp endpoint...\n');

    const testEmail = `test${Date.now()}@example.com`; // Unique email each time

    console.log('📧 Test Email:', testEmail);
    console.log('🌐 API URL: http://localhost:5001/api/v1/auth/request-otp\n');

    const response = await axios.post(
      'http://localhost:5001/api/v1/auth/request-otp',
      { email: testEmail },
      { headers: { 'Content-Type': 'application/json' } }
    );

    console.log('✅ SUCCESS! Response:');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('\n📬 Check the email inbox for OTP!');

  } catch (error) {
    console.error('❌ ERROR! Response:');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Data:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.log('No response received. Is the server running?');
      console.log('Make sure to start the server first: npm run dev');
    } else {
      console.error('Error:', error.message);
    }
  }
};

testRequestOTP();
