# Slideform

A small, self-contained browser app for collecting PowerPoint production requirements and creating a handoff ZIP.

## Run it

Open `index.html` in a current browser. No build step, account, server, or upload is needed.

## What it does

- Accepts `.ppt` and `.pptx` files up to 100 MB by browsing or drag and drop.
- Collects project name, requirements, audience, deadline, slide count, and requested format.
- Shows a live brief preview as the form is filled out.
- Creates a ZIP containing the selected original presentation, a JSON brief, a readable Markdown brief, and a short README.
- Provides a small correction review for the selected wording, including Chinese or English replace/remove instructions, live preview, saved revisions, and explicit approval.

Files remain in the browser; they are not sent to a server. The correction preview supports exact small replace/remove patterns and lets you edit the draft directly. This version creates a production handoff; it does not rewrite the uploaded PowerPoint. The approved text is packaged as a proposed change for the named part only. To update the actual slides or understand open-ended Chinese instructions, connect a language model and a PowerPoint editing service.
