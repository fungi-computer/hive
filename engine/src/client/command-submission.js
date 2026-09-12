/** Submit one ordinary user command and report admission synchronously. */
export function submitCommand(runtime, command, setMessage, successMessage = "Order queued") {
  try {
    runtime.send(command);
    setMessage(successMessage);
    return true;
  } catch (error) {
    setMessage(`Order refused: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}
