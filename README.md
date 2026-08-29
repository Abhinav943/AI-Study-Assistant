# AI Study Assistant (Frontend Internship Assignment)

This project is a React-based web application that takes free-form text input and generates interactive study flashcards using the Google Gemini AI model. It features a sleek dark-mode UI with micro-animations, handling for unpredictable AI output, and a complete re-test workflow for incorrect answers.

## Architecture
- **Frontend**: React (via Vite) with Vanilla CSS for styling.
- **Backend**: Express (Node.js) server to securely handle the Gemini API key and requests.
- **AI**: Google Gemini API (`gemini-1.5-flash`), explicitly prompted to return structured JSON.

## Setup & Running Locally

### Prerequisites
- Node.js (v18+)
- A [Google Gemini API Key](https://aistudio.google.com/app/apikey) (Free)

### Installation
1. Clone the repository and navigate to the root directory (`study-assistant`).
2. Install dependencies for both the frontend and backend:
   ```bash
   cd server && npm install
   cd ../client && npm install
   ```

### Configuration
1. In the `server` directory, copy the example environment file:
   ```bash
   cd server
   cp .env.example .env
   ```
2. Open `server/.env` and add your Gemini API key:
   ```env
   GEMINI_API_KEY=your_actual_key_here
   ```

### Running the App
Start both servers in separate terminal windows:

**Terminal 1 (Backend API):**
```bash
cd server
npm start
```
*The server runs on http://localhost:3000*

**Terminal 2 (Frontend Client):**
```bash
cd client
npm run dev
```
*The client runs on http://localhost:5173*

## Demo
Watch the app in action: [Video link](https://drive.google.com/file/d/1DTvhUx-OajvawE0pgXgqioR4pU0Jy0G2/view?usp=sharing)

## AI Usage Note
AI was used during the development of this project in the following ways:
- **Code Generation & Boilerplate**: Assisting in writing repetitive React state boilerplate and CSS animations (specifically the 3D flip transform).
- **Architecture Planning**: Helping to structure the Vite + Express split to ensure the API key is not shipped to the browser.
- **Prompt Engineering**: Refining the LLM prompt in `server.js` to strictly enforce the JSON schema.

## Handling Bad AI Output
A major focus of this implementation is reliability:
1. **JSON Parsing & Validation**: The backend explicitly requests a JSON mime type, strips away markdown wrappers (`\`\`\`json`), and parses the result. If parsing fails, it safely falls back to a standard 500 error instead of crashing the UI.
2. **Schema Enforcement**: Even if the AI returns JSON, the server checks that it's an Array of objects with `front` and `back` keys. Invalid cards are safely filtered out.
3. **Stale Response Prevention**: The React frontend uses an `AbortController`. If a user clicks "Generate" multiple times in a row, older network requests are aborted so their responses don't accidentally overwrite the newest one.

## Known Limitations
- **Token Limits**: Very large notes may exceed the token limit of the Gemini free tier.
- **Persistent Storage**: Currently, flashcards are lost upon page reload. Adding `localStorage` would be the next step.

## Time Spent
- **Planning & Architecture**: 1 hour
- **Backend & AI Integration**: 2 hours
- **Frontend React Logic**: 2.5 hours
- **Styling & Polish**: 1.5 hours
- **Total Time**: ~7 hours
