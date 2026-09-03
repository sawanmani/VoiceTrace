package com.voicetrace.service

import android.telecom.Call
import android.telecom.InCallService
import android.util.Log

/**
 * VoiceTraceInCallService
 * 
 * To intercept cellular calls natively on Android and protect personal phone calls,
 * VoiceTrace must be set as the user's Default Phone App (Dialer). 
 * 
 * This service receives callbacks when a cellular call is added (incoming/outgoing).
 * From here, we can overlay our SYSTEM_ALERT_WINDOW UI and start capturing the
 * AudioRecord stream to feed into the local ONNX model.
 */
class VoiceTraceInCallService : InCallService() {

    override fun onCallAdded(call: Call?) {
        super.onCallAdded(call)
        Log.d("VoiceTrace", "Call added: ${call?.details?.handle}")
        
        // 1. Show floating UI overlay (Risk Gauge) over the call screen
        // showOverlayUI()
        
        // 2. Start local audio capture
        // startAudioCapture()
        
        // 3. Feed audio chunks into the ONNX AASIST-L Edge Model
        // startEdgeInference()
    }

    override fun onCallRemoved(call: Call?) {
        super.onCallRemoved(call)
        Log.d("VoiceTrace", "Call removed.")
        
        // 1. Remove overlay UI
        // 2. Stop audio capture
        // 3. Stop inference
    }
}
