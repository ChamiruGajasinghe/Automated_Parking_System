import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001', {
  transports: ['websocket'],
  upgrade: false
});

function App() {
  const [data, setData] = useState(null);
  const [yoloFrame, setYoloFrame] = useState(null);
  const [yoloDetections, setYoloDetections] = useState([]);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [manualSlotId, setManualSlotId] = useState("A1");
  const [mode, setMode] = useState("AUTO");

  // Phone IP Webcam URL for the Gate Cam
  // -> CHANGE THE IP ADDRESS TO MATCH YOUR PHONE!
  const GATE_CAM_URL = "http://192.168.8.178:8080/video";

  const dispatchManualCommand = () => {
    // Front-end safeguard: block dispatch if human detected
    if (yoloDetections.some(d => d.className === 'person')) {
      playAlarm();
      return; // Do not send command
    }

    if (isConnected) {
      socket.emit('manual_command', { slotId: manualSlotId });
    }
  };

  const playAlarm = () => {
    // Generate a simple digital alarm siren using Web Audio API!
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(600, audioCtx.currentTime); // 600 Hz
    oscillator.frequency.setValueAtTime(900, audioCtx.currentTime + 0.15); // jump to 900Hz
    
    gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime); // Volume
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.3); // play for 300ms
  };

  // Play audio continuously if backend says HALTED_HUMAN
  useEffect(() => {
    if (data?.lift?.status === "HALTED_HUMAN") {
      const interval = setInterval(playAlarm, 500); // Beep twice a second
      return () => clearInterval(interval);
    }
  }, [data?.lift?.status]);

  const clearHumanHalt = () => {
    if (yoloDetections.some(d => d.className === 'person')) {
      alert("Cannot clear! The camera still detects a human.");
      return;
    }
    if (isConnected) {
      socket.emit('clear_human_halt');
    }
  };

  const toggleSystemMode = () => {
    const nextMode = mode === "AUTO" ? "MANUAL" : "AUTO";
    socket.emit('toggle_mode', nextMode);
  };

  const isDispatchDisabled = mode === "AUTO" || !["IDLE", "IDLE_READY", "READY", "PARKING_IDLE"].includes(data?.lift?.status);

  useEffect(() => {
    // 1. Handle Connection Status
    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    // 2. Main Data Catch (The "Lift Mover")
    const onDashboardUpdate = (incomingData) => {
      // DEBUG: Uncomment the line below to verify data is arriving in your browser console
      // console.log("Incoming Floor:", incomingData?.lift?.currentFloor);
      setData({...incomingData}); // Using spread to force a re-render
    };

    const onYoloUpdate = (frameData) => {
      if (frameData) {
        if (frameData.image) setYoloFrame(frameData.image);
        if (frameData.detections) setYoloDetections(frameData.detections);
      }
    };

    const onModeUpdate = (newMode) => {
      setMode(newMode);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('dashboard_update', onDashboardUpdate);
    socket.on('yolo_update', onYoloUpdate);
    socket.on('mode_update', onModeUpdate);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('dashboard_update', onDashboardUpdate);
      socket.off('yolo_update', onYoloUpdate);
      socket.off('mode_update', onModeUpdate);
    };
  }, []);

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden bg-[#0a0a0c] text-slate-200 font-sans">
      
      {/* --- SAFETY OVERLAY --- */}
      {data?.lift?.status === "HALTED_HUMAN" && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl pointer-events-auto transition-all duration-300 p-4">
           {/* 80% Viewport Wrapper */}
           <div className="w-[80vw] h-[80vh] flex flex-col bg-red-950/20 border-4 border-red-600 shadow-[0_0_100px_rgba(220,38,38,0.4)] rounded-2xl overflow-hidden relative">
              
              {/* Feed Area */}
              <div className="flex-1 bg-black relative flex items-center justify-center overflow-hidden">
                 <div className="absolute top-4 left-4 z-10 bg-black/80 px-4 py-2 rounded text-xs font-mono text-red-400 border border-red-500/30 flex items-center gap-3 backdrop-blur-md shadow-lg">
                    <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></div>
                    LIVE SECURITY FEED VERIFICATION
                 </div>
                 <img 
                   src={GATE_CAM_URL} 
                   alt="Gate RAW Feed" 
                   className="w-full h-full object-contain" 
                   onError={(e) => { e.target.style.display = 'none'; }}
                 />
              </div>

              {/* Warning Footer */}
              <div className="bg-[#0a0a0c] border-t-4 border-red-600 p-6 flex flex-col md:flex-row items-center justify-between gap-6 shrink-0 z-20">
                 <div className="flex flex-col items-center md:items-start">
                    <div className="text-3xl font-black animate-pulse tracking-widest text-red-500">
                      ⚠️ EMERGENCY HALT
                    </div>
                    <span className="text-sm font-mono tracking-[0.2em] text-red-200 mt-2 text-center md:text-left">
                      HUMAN DETECTED ON LIFT - VISUAL CLEARANCE REQUIRED
                    </span>
                 </div>
                 
                 <button 
                    onClick={clearHumanHalt}
                    className="bg-red-600 hover:bg-red-500 text-white border-2 border-red-400 text-xl font-black py-4 px-8 rounded tracking-widest transition-all hover:scale-[1.02] active:scale-95 whitespace-nowrap shadow-[0_0_30px_rgba(220,38,38,0.5)]"
                 >
                    CONFIRM CLEAR & RESUME LIFT
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* --- HEADER --- */}
      <header className="h-16 border-b border-white/10 flex items-center justify-between px-8 bg-[#111114] z-50">
        <h1 className="text-xl font-bold tracking-[0.2em] text-[#d4af37]">
          SMART PARKING <span className="text-white/20 font-light">v1.0</span>
        </h1>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4 bg-white/5 px-4 py-1.5 rounded-lg border border-white/10">
              <span className={`text-[10px] font-bold ${mode === 'AUTO' ? 'text-blue-400' : 'text-white/30'}`}>AUTO (LabVIEW)</span>
              <button 
                  onClick={toggleSystemMode}
                  className={`w-12 h-6 rounded-full relative transition-colors ${mode === 'MANUAL' ? 'bg-orange-500' : 'bg-blue-600'}`}
              >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${mode === 'MANUAL' ? 'left-7' : 'left-1'}`} />
              </button>
              <span className={`text-[10px] font-bold ${mode === 'MANUAL' ? 'text-orange-400' : 'text-white/30'}`}>MANUAL (Web)</span>
          </div>
          <div className={`px-3 py-1 rounded-full text-[10px] font-mono tracking-widest border ${isConnected ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
            {isConnected ? '● SYSTEM LIVE' : '○ DISCONNECTED'}
          </div>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-[1.2fr_450px_320px] gap-6 p-6 overflow-hidden">
        
        {/* COLUMN 1: EXPANDED MECHANICAL CORE */}
        <section className="bg-[#111114] rounded-xl border border-white/5 p-6 flex flex-col shadow-2xl">
          <div className="flex justify-between items-center mb-6">
             <h2 className="text-[11px] font-bold text-white/40 uppercase tracking-[0.2em]">Mechanical Core Section</h2>
             <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono text-white/30 italic">Z-Height: {(data?.lift?.currentFloor || 0).toFixed(2)}m</span>
                <span className="text-xs font-mono text-[#d4af37] px-2 py-0.5 bg-[#d4af37]/10 rounded border border-[#d4af37]/20">{data?.lift?.status || "IDLE"}</span>
             </div>
          </div>

          <div className="flex-1 flex gap-6 bg-black/40 rounded-xl p-6 border border-white/10 relative overflow-hidden shadow-inner">
            <div className="w-32 h-full relative border-r border-white/10 bg-black/20">
               {[2, 1, 0].map(f => (
                 <div key={f} className="h-1/3 border-b border-white/5 flex items-end p-3 text-[10px] text-white/10 font-mono">
                   LEVEL 0{f}
                 </div>
               ))}
               
               {/* THE LIFT CARRIAGE - Matches Stepper Y EXACTLY */}
               {/* 42000 is roughly the max physical Y boundary in your node logic */}
               <div 
                 className="absolute left-3 right-3 h-[33.33%] bg-gradient-to-b from-[#d4af37] to-[#8a6d1a] rounded shadow-[0_0_40px_rgba(212,175,55,0.25)] flex flex-col items-center justify-center border-t border-white/30 z-20 transition-all duration-300 ease-out"
                 style={{ 
                   bottom: `${Math.min(66.66, ((data?.lift?.raw_y || 0) / 42000) * 80)}%` 
                 }}
               >
                 <div className="w-12 h-1 bg-black/40 rounded-full mb-1 animate-pulse"></div>
                 <span className="text-black font-black text-[11px] tracking-tighter">CAR MAST</span>
               </div>
            </div>

            <div className="flex-1 flex flex-col">
              {[2, 1].map(floorNum => (
                <div key={floorNum} className="h-1/3 border-b border-white/5 flex items-center px-4">
                   <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                     {data?.slots?.filter(s => s.floor === floorNum).map(slot => (
                       <div key={slot.id} className={`h-20 rounded-lg border flex flex-col items-center justify-center transition-all ${slot.occupied ? 'border-red-900/50 bg-red-950/20' : 'border-white/5 bg-white/5'}`}>
                         <span className="text-[9px] text-white/30 mb-1 font-mono">{slot.id}</span>
                         <div className={`w-3 h-3 rounded-full ${slot.occupied ? 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.5)]' : 'bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.3)]'}`}></div>
                       </div>
                     ))}
                   </div>
                </div>
              ))}
              <div className="h-1/3 flex items-center justify-center">
                 <div className="p-4 border border-dashed border-[#d4af37]/30 rounded-lg bg-black/40 flex flex-col gap-3 items-center w-3/4 max-w-sm">
                    <span className="text-[10px] font-bold text-[#d4af37] tracking-[0.2em] uppercase">Manual Override</span>
                    
                    <div className="flex gap-2 w-full">
                       <select 
                         className="flex-1 bg-black/50 border border-white/20 text-white/70 text-xs px-2 py-1.5 rounded outline-none focus:border-[#d4af37]/50 transition-colors"
                         value={manualSlotId}
                         onChange={(e) => setManualSlotId(e.target.value)}
                       >
                         {data?.slots?.map(s => (
                           <option key={s.id} value={s.id}>
                             SLOT {s.id} (Floor 0{s.floor}) - {s.occupied ? 'FULL' : 'EMPTY'}
                           </option>
                         ))}
                       </select>
                       <button 
                         onClick={dispatchManualCommand}
                         className="bg-[#d4af37]/10 hover:bg-[#d4af37]/30 disabled:opacity-30 disabled:hover:bg-[#d4af37]/10 text-[#d4af37] border border-[#d4af37]/50 text-xs font-bold tracking-widest px-4 py-1.5 rounded transition-all"
                         disabled={isDispatchDisabled}
                       >
                         DISPATCH
                       </button>
                    </div>

                    <span className="text-[8px] text-white/30 italic text-center leading-tight">
                      {mode === "AUTO" ? "Switch to MANUAL mode to dispatch commands." : (!["IDLE", "IDLE_READY", "READY", "PARKING_IDLE"].includes(data?.lift?.status) ? "Lift busy. Please wait." : "Select slot. If full, it retrieves. If empty, it parks.")}
                    </span>
                 </div>
              </div>
            </div>
          </div>
        </section>

        {/* COLUMN 2: SQUARE CAMERA FEEDS */}
        <section className="flex flex-col gap-6 overflow-hidden">
          <div className="w-full aspect-square bg-[#111114] rounded-xl border border-white/5 p-2 flex flex-col relative overflow-hidden shadow-2xl">
            <div className="absolute top-4 left-4 z-10 bg-black/60 px-3 py-1 rounded border border-white/10 backdrop-blur-md">
                <span className="text-[9px] font-mono text-[#d4af37] tracking-widest uppercase italic">AI Analysis</span>
            </div>
            
            {/* Detection Indicators */}
            <div className="absolute bottom-4 left-0 right-0 z-10 flex justify-center gap-4 px-4">
               {(() => {
                 const bestPerson = yoloDetections.filter(d => d.className === 'person').sort((a,b) => b.confidence - a.confidence)[0];
                 const bestCar = yoloDetections.filter(d => d.className === 'car').sort((a,b) => b.confidence - a.confidence)[0];
                 
                 return (
                   <>
                     {/* Person Indicator */}
                     <div className={`flex-1 flex flex-col items-center justify-center p-2 rounded border backdrop-blur-md transition-colors ${bestPerson ? 'bg-green-500/20 border-green-500/50 text-green-400' : 'bg-black/60 border-white/10 text-white/30'}`}>
                        <span className="text-[10px] font-bold tracking-widest uppercase">PERSON</span>
                        <span className="text-[9px] font-mono mt-0.5">{bestPerson ? `${(bestPerson.confidence * 100).toFixed(0)}% MATCH` : 'NO DETECT'}</span>
                     </div>
                     {/* Car Indicator */}
                     <div className={`flex-1 flex flex-col items-center justify-center p-2 rounded border backdrop-blur-md transition-colors ${bestCar ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-black/60 border-white/10 text-white/30'}`}>
                        <span className="text-[10px] font-bold tracking-widest uppercase">CAR</span>
                        <span className="text-[9px] font-mono mt-0.5">{bestCar ? `${(bestCar.confidence * 100).toFixed(0)}% MATCH` : 'NO DETECT'}</span>
                     </div>
                   </>
                 );
               })()}
            </div>

            <div className="flex-1 bg-black rounded-lg flex items-center justify-center overflow-hidden border border-white/5 relative">
                {yoloFrame ? (
                  <img src={`data:image/jpeg;base64,${yoloFrame}`} className="w-full h-full object-cover" alt="YOLO" />
                ) : (
                  <div className="text-white/10 text-[10px] font-mono uppercase">Wait for Stream</div>
                )}
            </div>
          </div>

          <div className="w-full aspect-square bg-[#111114] rounded-xl border border-white/5 p-2 flex flex-col relative overflow-hidden shadow-2xl">
            <div className="absolute top-4 left-4 z-10 bg-black/60 px-3 py-1 rounded border border-white/10">
                <span className="text-[9px] font-mono text-white/40 uppercase">Gate RAW</span>
            </div>
            <div className="flex-1 bg-black rounded-lg border border-white/5 flex items-center justify-center overflow-hidden">
               <img 
                 src={GATE_CAM_URL} 
                 alt="Gate RAW Feed" 
                 className="w-full h-full object-cover opacity-80" 
                 onError={(e) => { e.target.style.display = 'none'; }}
               />
            </div>
          </div>
        </section>

        {/* COLUMN 3: OPERATIONAL MONITORING */}
        <section className="bg-[#111114] rounded-xl border border-white/5 p-4 flex flex-col gap-6">
          <div className="bg-black/40 rounded-xl p-5 border border-white/10 shadow-lg">
            <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-4">Latest Authorization</h3>
            <div className="flex gap-4 items-center">
               <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-white/5 to-white/10 border border-white/10 flex items-center justify-center shadow-inner">
                  <svg className="w-7 h-7 text-white/10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
               </div>
               <div className="flex flex-col">
                 <p className="text-xs font-mono text-[#d4af37]">{data?.recentRFID?.uid || "AWAITING..."}</p>
                 <p className={`text-[10px] font-black tracking-widest mt-1 ${data?.recentRFID?.status === 'authorized' ? 'text-green-500' : 'text-red-500'}`}>
                   {data?.recentRFID?.status?.toUpperCase() || "IDLE"}
                 </p>
               </div>
            </div>
          </div>

          <div className="flex-1 bg-black/20 rounded-xl p-4 border border-white/5 flex flex-col min-h-0">
            <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-4 border-b border-white/5 pb-2">Storage Matrix</h3>
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-5">
                {[2, 1].map(floorNum => (
                    <div key={floorNum}>
                        <div className="flex justify-between items-center mb-3">
                           <h4 className="text-[9px] text-[#d4af37] font-mono tracking-widest uppercase">LVL 0{floorNum}</h4>
                           <div className="h-[1px] flex-1 bg-white/5 ml-3"></div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                        {data?.slots?.filter(s => s.floor === floorNum).map(slot => (
                            <div key={slot.id} className={`h-14 rounded-md border flex flex-col items-center justify-center transition-all ${slot.occupied ? 'border-red-900/50 bg-red-950/10' : 'border-white/10 bg-white/5'}`}>
                               <span className="text-[9px] text-white/30 font-mono mb-0.5">{slot.id}</span>
                               <span className={`text-[9px] font-bold ${slot.occupied ? 'text-red-500' : 'text-green-500'}`}>{slot.occupied ? 'FULL' : 'OPEN'}</span>
                            </div>
                        ))}
                        </div>
                    </div>
                ))}
            </div>
          </div>
        </section>
      </main>

      {/* --- FOOTER --- */}
      <footer className="h-12 bg-[#111114] border-t border-white/10 px-8 flex items-center justify-end text-[10px] font-mono text-white/20">
         <div className="flex gap-8">
            <span>SYNC_LATENCY: 4.2ms</span>
            <span className="text-green-500/50">SYSTEM_OPTIMAL_V2</span>
         </div>
      </footer>
    </div>
  );
}

export default App;