# Organyzer

Collaborative boards for teams. Create a group, invite people with a code, and organize ideas together on boards made of notes, tables and images, synced in real time. Sign in with Google, install it as an app on your phone.

![version](https://img.shields.io/badge/version-0.5.0-4f46e5) ![license](https://img.shields.io/badge/license-MIT-green)

## Features

- **Google sign-in** through Firebase Authentication.
- **Groups and boards**: every group has its own boards; join a group with an invite code.
- **Roles**: the creator is always an admin. Admins manage members (change roles, remove people) and create boards. Guests can read and contribute items.
- **Notes, checklists, tables and images** with real-time sync (Cloud Firestore). Each item can have its own color, width, text size and header row, and items can be reordered by dragging (touch friendly).
- **Presence**: see who is online in a group and when everyone was last seen. Boards show a red dot when someone else edited them since your last visit, plus the date, time and author of the last edit.
- **Housekeeping**: admins rename groups and boards and delete boards; members can leave a group. Destructive actions ask for confirmation.
- **Share invites**: a share button uses the phone's native share sheet (or copies the link) with an invite link that joins the group on open. Shared links show a preview card (title, description and image) thanks to Open Graph / Twitter meta tags in `index.html`. If you fork the project, replace `https://organyzer.web.app` there with your own domain.
- **Installable PWA**: works on any phone or desktop browser, no app store needed.
- **Light, dark and automatic theme**, and **Spanish / English** interface, both chosen from the footer.

## Tech stack

React 19 · TypeScript · Vite · React Router · Firebase (Auth, Firestore, Hosting) · vite-plugin-pwa

## Getting started

You need Node.js 20+ and your own Firebase project.

1. **Create a Firebase project** and register a web app.
2. In **Authentication**, enable the **Google** sign-in provider.
3. In **Cloud Firestore**, create a database in production mode.
4. Install and configure:

   ```bash
   npm install
   ```

   Create a `.env.local` file in the project root with your Firebase web config
   (Firebase console → Project settings → General → Your apps):

   ```text
   VITE_FIREBASE_API_KEY=
   VITE_FIREBASE_AUTH_DOMAIN=
   VITE_FIREBASE_PROJECT_ID=
   VITE_FIREBASE_STORAGE_BUCKET=
   VITE_FIREBASE_MESSAGING_SENDER_ID=
   VITE_FIREBASE_APP_ID=
   ```

   Then start the dev server:

   ```bash
   npm run dev
   ```

5. Publish the security rules (they are what protects your data, so do not skip this):

   ```bash
   npx firebase-tools login
   npx firebase-tools deploy --only firestore:rules --project <your-project-id>
   ```

The Firebase web config values are public by design; access is enforced by `firestore.rules`.

## Deploying

```bash
npm run build
npx firebase-tools deploy --only hosting,firestore:rules --project <your-project-id>
```

`firebase.json` lists the Hosting sites it deploys to. Change the `site` values to the ones in your own project. Add your Hosting domain under **Authentication → Settings → Authorized domains** so Google sign-in works there.

## Data model

```text
groups/{groupId}
  name, ownerId, memberIds[], roles{uid: admin|guest}, profiles{uid: {name, photoURL}}
  boards/{boardId}
    items/{itemId}   type: text | image | table, plus optional style fields
```

Images are resized in the browser and stored inside Firestore documents, so no paid storage plan is required.

## Roadmap

- Command palette (Ctrl/Cmd+K)
- Board templates
- Comments and reactions

## License

[MIT](LICENSE) © 2026 iaTech
