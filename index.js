import { getContext } from "../../../extensions.js";
import { eventSource, event_types } from "../../../../script.js";

// Register an event listener for incoming messages.
eventSource.on(event_types.MESSAGE_RECEIVED, handleIncomingMessage);

// Retrieve application context, including chat logs and participant info.
const context = getContext();

function handleIncomingMessage(data) {
    // Access the most recent message from the chat log.
    let mostRecentMessage = context.chat[context.chat.length - 1];

    // Check browser support for speech synthesis.
    if ('speechSynthesis' in window) {
        // Render the announcement of the character's message to audio.
        let utterance = new SpeechSynthesisUtterance(mostRecentMessage.name + " said something");
        window.speechSynthesis.speak(utterance);
    } else {
        // Log an error if speech synthesis isn't supported.
        console.error("Speech synthesis is not supported in this browser.");
    }
}