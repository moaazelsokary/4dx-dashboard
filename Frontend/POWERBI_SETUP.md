# Power BI Dashboard Setup Guide

## Overview
This guide explains how to set up and use the Power BI dashboard integration in your website.

## What We've Created
1. **PowerBIDashboard.tsx** - Main page for hosting Power BI dashboards using iframe embedding
2. **powerbi.ts** - Configuration file for dashboard URLs
3. **Navigation** - Added to main Dashboard page
4. **Route** - Added `/powerbi` route to your app

## Setup Steps

### 1. Get Your Power BI Embed URLs
1. Go to your Power BI dashboard
2. Click the **"Embed"** button (usually in the top right)
3. Copy the **HTML code** (not just the link)
4. The HTML will look like this:
   ```html
   <iframe title="Dashboard Name" width="1140" height="541.25" 
           src="https://app.powerbi.com/view?r=eyJrIjoi...&embedImagePlaceholder=true" 
           frameborder="0" allowFullScreen="true"></iframe>
   ```

### 2. Update Configuration
1. Open `src/config/powerbi.ts`
2. Replace the placeholder URLs with your actual embed URLs
3. Extract the `src` attribute from the HTML code
4. Add more dashboards as needed

### 3. Example Configuration
```typescript
export const POWERBI_CONFIG = {
  dashboards: [
    {
      id: 'volunteers',
      name: 'Volunteers Dashboard',
      embedUrl: 'https://app.powerbi.com/view?r=eyJrIjoi...&embedImagePlaceholder=true',
      title: 'Volunteers Dashboard'
    },
    {
      id: 'sales',
      name: 'Sales Dashboard',
      embedUrl: 'https://app.powerbi.com/view?r=eyJrIjoi...&embedImagePlaceholder=true',
      title: 'Sales Dashboard'
    }
  ]
};
```

## Features

### ✅ What Works
- **Multiple Dashboards** - Switch between different Power BI dashboards
- **Full Interactivity** - All Power BI features work (filtering, drilling, etc.) via iframe
- **Responsive Design** - Works on all screen sizes
- **Authentication** - Only accessible to logged-in users
- **Theme Integration** - Matches your existing website design
- **Simple & Reliable** - Uses standard iframe embedding for maximum compatibility

### 🔧 Dashboard Controls
- **Dropdown Selector** - Choose which dashboard to display
- **Refresh Button** - Reload the current dashboard
- **Loading States** - Shows progress while loading
- **Error Handling** - Displays helpful error messages

### 🎨 UI Elements
- **Header** - Page title and navigation
- **Sidebar** - Quick navigation to other pages
- **Cards** - Clean, organized layout
- **Icons** - Visual indicators for better UX

## Adding New Dashboards

1. **Get the embed HTML** from Power BI
2. **Extract the URL** from the `src` attribute
3. **Add to config** in `powerbi.ts`:
   ```typescript
   {
     id: 'unique-id',
     name: 'Dashboard Display Name',
     embedUrl: 'your-embed-url-here',
     title: 'Dashboard Title'
   }
   ```

## Troubleshooting

### Dashboard Won't Load
- Check that the embed URL is correct
- Ensure the Power BI dashboard is published and accessible
- Check browser console for error messages

### Authentication Issues
- Make sure you're logged into your website
- Check that the Power BI dashboard allows anonymous access

### Performance Issues
- Large dashboards may take time to load
- Use the refresh button if needed
- Check your internet connection

## Security Notes
- Power BI dashboards are embedded using standard iframe embedding
- No data is stored on your server
- Authentication is handled by Power BI's security
- Users need appropriate Power BI permissions
- Iframe embedding provides the same security as viewing directly in Power BI

## Next Steps
1. **Test the integration** with your first dashboard
2. **Add more dashboards** as needed
3. **Customize the styling** if desired
4. **Set up user permissions** in Power BI if needed

## Support
If you encounter issues:
1. Check the browser console for errors
2. Verify your Power BI embed URLs
3. Ensure Power BI dashboards are properly published
4. Check that users have appropriate access permissions
