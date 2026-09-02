class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(4096);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0];

    for (let i = 0; i < channelData.length; i++) {
      this.buffer[this.bufferIndex++] = channelData[i];
      if (this.bufferIndex >= this.buffer.length) {
        // Send a copy to the main thread
        this.port.postMessage(this.buffer.slice(0));
        this.bufferIndex = 0;
      }
    }

    return true; // Keep alive
  }
}

registerProcessor('pcm-processor', PCMProcessor);
