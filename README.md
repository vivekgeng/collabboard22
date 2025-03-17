# **CollabAI - AI-Powered Collaborative Whiteboard**

CollabAI is a real-time, AI-powered collaborative whiteboard that allows multiple users to draw, chat, and interact using hand gestures. It integrates Google Gemini AI to analyze handwritten math problems and provide step-by-step solutions. 

---

## **🚀 Features**  
✔️ **Real-time Whiteboard** – Draw and erase collaboratively using WebSockets.  
✔️ **Hand Gesture Drawing** – Use hand tracking to draw directly with gestures.  
✔️ **AI Math Solver** – Submit handwritten problems for AI-generated solutions.  
✔️ **Multi-User Collaboration** – Connect multiple users to a shared whiteboard.  
✔️ **Chat Functionality** – Communicate in real time via built-in chat.  
✔️ **Save & Export** – Save your whiteboard drawings as PDFs.  

![image](https://github.com/user-attachments/assets/c229628f-5366-45fa-9f0e-e4b755e68457)


---

## **🛠️ Tech Stack**  
- **Frontend:** React, Socket.io-client, React Router  
- **Backend:** Node.js, Express, Socket.io  
- **AI Integration:** Google Gemini API  
- **Styling:** CSS, Chakra UI  
- **Security:** Helmet, CORS, Rate Limiting  

---

## **📦 Installation & Setup**  

### **1️⃣ Clone the Repository**  
```sh
git clone https://github.com/yourusername/collabai.git
cd collabai
```

### **2️⃣ Setup the Backend**  
```sh
cd server
npm install
```
**Create a `.env` file in the `server` directory and add:**  
```env
PORT=5000
GEMINI_API_KEY=your_google_gemini_api_key
ALLOWED_ORIGINS=http://localhost:3000
```
**Start the server:**  
```sh
npm start
```

### **3️⃣ Setup the Frontend**  
```sh
cd ../client
npm install
```
**Create a `.env` file in the `client` directory and add:**  
```env
REACT_APP_SERVER_URL=http://localhost:5000
NEXT_PUBLIC_GEMINI_API_KEY=your_google_gemini_api_key
```
**Start the frontend:**  
```sh
npm start
```

---

## **📌 Usage**  
1. Open `http://localhost:3000` in your browser.  
2. Enter a **Room ID** to join or create a new collaborative session.  
3. Start **drawing, chatting, and using AI-powered math solving**.  
4. Enable **hand gestures** to draw using your webcam.  

---

## **🖐️ Hand Gesture Controls**  
| **Gesture**        | **Action**          |  
|--------------------|--------------------|  
| **Pointing Index Finger** | Draw on the board |  
| **Two Fingers Up** | Stop drawing |  
| **Thumb & Index Pinch** | Submit to AI |  
| **Thumb Up** | Clear the board |  

---

## **📜 License**  
This project is open-source and available under the **MIT License**.  

---

## **👨‍💻 Contributing**  
Pull requests are welcome! Please fork the repo and create a new branch for your contributions.  

---

## **📧 Contact**  
For issues or inquiries, reach out at **gengajev43@gmail.com**.  

🚀 **Enjoy collaborating with AI on CollabAI!** 🎨
