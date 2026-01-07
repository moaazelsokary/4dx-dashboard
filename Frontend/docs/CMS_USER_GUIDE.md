# CMS User Guide

This guide helps content editors and administrators use the CMS (Content Management System) effectively.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Pages](#pages)
3. [Images](#images)
4. [Announcements](#announcements)
5. [Menu Items](#menu-items)
6. [Content Guidelines](#content-guidelines)
7. [FAQ](#faq)

## Getting Started

### Accessing the CMS

1. Sign in to the application with an Admin, Editor, or CEO account
2. Navigate to `/admin/cms` or click the "CMS Admin" link in the navigation
3. You'll see tabs for Pages, Images, Announcements, and Menu Items

### Permissions

- **Admin & CEO**: Full access to create, edit, and delete all content
- **Editor**: Can create and edit content, but cannot delete

## Pages

### Creating a Page

1. Go to the **Pages** tab
2. Click **Add Page**
3. Fill in the required fields:
   - **Title**: The page title (appears in browser tab and page header)
   - **Slug**: URL-friendly version of the title (auto-generated from title)
   - **Content**: The main page content (supports Markdown and HTML)
4. Optional fields:
   - **Meta Description**: SEO description (appears in search results)
   - **Meta Keywords**: SEO keywords (comma-separated)
   - **Published**: Toggle to make page visible to visitors
5. Click **Create Page**

### Editing a Page

1. Find the page in the Pages list
2. Click the **Edit** icon (pencil)
3. Make your changes
4. Click **Update Page**

### Deleting a Page

1. Find the page in the Pages list
2. Click the **Delete** icon (trash)
3. Confirm deletion

**Note**: Only Admins and CEOs can delete pages.

### Content Editor

The content editor supports:
- **Markdown**: Use `**bold**`, `*italic*`, `[links](url)`, `- lists`
- **HTML**: Direct HTML tags like `<u>underline</u>`
- **Preview**: See a live preview of your content as you type

**Formatting Shortcuts:**
- Click formatting buttons above the editor
- Or type Markdown syntax directly

## Images

### Uploading Images

1. Go to the **Images** tab
2. Click **Upload Image**
3. Select an image file (max 5MB)
4. Supported formats: JPG, PNG, GIF, WebP

### Using Images

- Images are automatically optimized for web
- Copy the image URL to use in page content
- Images are stored securely and can be referenced by ID

### Deleting Images

1. Hover over an image
2. Click the **Delete** button
3. Confirm deletion

**Note**: Only Admins and CEOs can delete images.

## Announcements

### Creating an Announcement

1. Go to the **Announcements** tab
2. Click **Add Announcement**
3. Fill in the fields:
   - **Title**: Announcement headline
   - **Content**: Announcement text (supports Markdown/HTML)
   - **Start Date**: When to start showing (optional)
   - **End Date**: When to stop showing (optional)
   - **Priority**: Higher numbers appear first (0-10)
   - **Active**: Toggle to show/hide announcement
4. Click **Create Announcement**

### Scheduling Announcements

- Set **Start Date** to schedule future announcements
- Set **End Date** to automatically hide after a date
- Announcements automatically show/hide based on dates

## Menu Items

### Creating a Menu Item

1. Go to the **Menu** tab
2. Click **Add Menu Item**
3. Fill in the fields:
   - **Label**: Text shown in menu
   - **URL**: Link destination (e.g., `/page-slug`)
   - **Icon**: Icon name or class (optional)
   - **Display Order**: Lower numbers appear first
   - **Active**: Toggle to show/hide in menu
   - **Open in New Tab**: Open link in new browser tab
4. Click **Create Menu Item**

### Menu Hierarchy

- Use **Parent ID** to create sub-menus (future feature)
- Use **Display Order** to control menu item sequence

## Content Guidelines

### Best Practices

1. **Titles**: Keep titles concise and descriptive
2. **Slugs**: Use lowercase, hyphens instead of spaces
3. **Content**: 
   - Use headings to organize content
   - Keep paragraphs short (3-4 sentences)
   - Use lists for multiple items
   - Include images to break up text
4. **SEO**:
   - Write descriptive meta descriptions (150-160 characters)
   - Use relevant keywords naturally
   - Include keywords in titles and content

### Content Formatting

**Headings:**
```markdown
# Main Heading
## Subheading
### Section Heading
```

**Lists:**
```markdown
- Item 1
- Item 2
- Item 3
```

**Links:**
```markdown
[Link Text](https://example.com)
```

**Bold and Italic:**
```markdown
**bold text**
*italic text*
```

### Image Guidelines

- **File Size**: Keep images under 5MB
- **Dimensions**: Recommended max width: 1920px
- **Formats**: Use JPG for photos, PNG for graphics with transparency
- **Alt Text**: Always provide descriptive alt text for accessibility

## FAQ

### Q: Can I undo a deletion?

A: No, deletions are permanent. Be careful when deleting content.

### Q: Why can't I delete content?

A: Only Admins and CEOs can delete content. Editors can only create and edit.

### Q: How do I preview my page before publishing?

A: Set "Published" to off, then you can view the page in draft mode.

### Q: Can I schedule content for later?

A: Yes! Use the Start Date and End Date fields in announcements.

### Q: How do I add images to my page content?

A: Upload the image first, then copy its URL and use it in your content:
```markdown
![Alt text](image-url)
```

### Q: What's the difference between slug and title?

A: The title is what users see, the slug is the URL. For example:
- Title: "About Our Company"
- Slug: "about-our-company"
- URL: `/about-our-company`

### Q: How often does content update?

A: Content updates in real-time. Changes appear within 30 seconds.

## Getting Help

If you need assistance:
1. Check this guide first
2. Contact your system administrator
3. Review the error messages for specific issues

## Tips

- **Save frequently**: Don't lose your work
- **Preview before publishing**: Check how content looks
- **Use descriptive titles**: Help users find content
- **Test links**: Make sure all links work
- **Check mobile view**: Ensure content looks good on all devices

