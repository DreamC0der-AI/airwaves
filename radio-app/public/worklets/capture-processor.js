// AudioWorklet processor for capturing audio chunks.
// Runs in the AudioWorklet scope (no DOM access).
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    var input = inputs[0];
    if (input && input[0]) {
      this.port.postMessage({ audio: input[0] });
    }
    return true;
  }
}

registerProcessor("capture-processor", CaptureProcessor);
