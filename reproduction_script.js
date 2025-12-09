
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

async function testUpload() {
  const form = new FormData();
  form.append('title', 'Test Product');
  form.append('category', 'Test Category');
  form.append('price', '100');
  
  // Create a dummy file if not exists
  if (!fs.existsSync('test.jpg')) {
    fs.writeFileSync('test.jpg', 'dummy content');
  }

  form.append('product_image_0', fs.createReadStream('test.jpg'));

  try {
    const response = await axios.post('http://localhost:5000/api/v1/admin/products/create', form, {
      headers: {
        ...form.getHeaders(),
        // Add auth header if needed, but for now just validation of multipart handling
        'Authorization': 'Bearer ' 
      }
    });
    console.log('Success:', response.data);
  } catch (error) {
    if (error.response) {
        console.log('Error Status:', error.response.status);
        console.log('Error Data:', error.response.data);
    } else {
        console.log('Error:', error.message);
    }
  }
}

testUpload();

