# CMS API Validation & Testing Guide

## API Endpoints

### 1. GET `/api/v1/admin/cms/:page`
- **Purpose**: Fetch CMS content for a specific page
- **Auth**: Requires admin token
- **Response**: 
  ```json
  {
    "success": true,
    "message": "CMS content fetched successfully",
    "data": {
      "page": "home",
      "title": "Home Page",
      "content": [
        {
          "block_type": "heroBanner",
          "enabled": true,
          "order": 0,
          "banners": [...]
        },
        ...
      ]
    }
  }
  ```

### 2. POST `/api/v1/admin/cms`
- **Purpose**: Update CMS content
- **Auth**: Requires admin token
- **Request Body**:
  ```json
  {
    "page": "home",
    "title": "Home Page",
    "content": [
      {
        "block_type": "heroBanner",
        "enabled": true,
        "order": 0,
        "banners": [...]
      }
    ]
  }
  ```
- **Validation**:
  - `page` must be one of: `home`, `about`, `policies`, `header`, `footer`
  - For `home`/`about`: `content` must be an array of blocks
  - For `header`/`footer`/`policies`: `content` must be an object
  - Each block must have `block_type` field

### 3. PUT `/api/v1/admin/cms/:page`
- **Purpose**: Update CMS content for specific page (RESTful alternative)
- **Auth**: Requires admin token
- **Request Body**:
  ```json
  {
    "content": [
      {
        "block_type": "heroBanner",
        "enabled": true,
        "order": 0,
        "banners": [...]
      }
    ]
  }
  ```
- **Validation**: Same as POST endpoint

## Data Flow

### Frontend → Backend
1. **Page Builder** (`cms-page-builder.tsx`):
   - Converts blocks to backend format
   - Includes: `block_type`, `enabled`, `order`, and widget data
   - Sends via `useCmsMutation().updateContent()`

2. **Backend Controller** (`cms.admin.controller.js`):
   - Validates request body
   - Logs request details
   - Calls service layer

3. **Backend Service** (`cms.service.js`):
   - For `home`/`about` pages:
     - Deletes all existing documents
     - Inserts new documents (one per block)
     - Preserves `order` field
   - For other pages:
     - Updates or creates single document

### Backend → Database
- **Homepage/About**: Each block saved as separate document in collection
- **Header/Footer/Policies**: Single document per page
- All MongoDB internal fields (`_id`, `__v`, `createdAt`, `updatedAt`) are removed before returning

## Validation Rules

### Block Structure (for home/about pages)
```javascript
{
  block_type: string,  // Required: "heroBanner", "categories", etc.
  enabled: boolean,    // Optional, defaults to true
  order: number,      // Required: determines display order
  ...widgetData       // Widget-specific data (banners, categories, etc.)
}
```

### Widget Data Examples

#### Hero Banner
```javascript
{
  block_type: "heroBanner",
  enabled: true,
  order: 0,
  banners: [
    {
      image_small: { url: "...", public_id: "...", ... },
      image_large: { url: "...", public_id: "...", ... },
      link: "/category-slug"
    }
  ]
}
```

#### Category Slider
```javascript
{
  block_type: "categories",
  enabled: true,
  order: 1,
  categories: [
    {
      id: "...",
      name: "...",
      slug: "...",
      icon: { url: "...", public_id: "...", ... }
    }
  ]
}
```

## Testing Checklist

- [ ] GET `/api/v1/admin/cms/home` returns all blocks
- [ ] POST `/api/v1/admin/cms` saves blocks correctly
- [ ] Blocks are saved with correct `order` field
- [ ] Adding new blocks creates new documents
- [ ] Updating existing blocks updates documents
- [ ] Removing blocks deletes documents
- [ ] Reordering blocks updates `order` field
- [ ] Database reflects changes immediately after save
- [ ] Validation errors are returned for invalid data
- [ ] Logs show complete request/response flow

## Logging

The API includes comprehensive logging:
- Request received with page and content preview
- Validation results
- Database operations (delete, insert, update)
- Response data structure
- Error details

Check backend console for detailed logs when testing.

