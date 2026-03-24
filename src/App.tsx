import { useState, useEffect, useRef } from 'react'
import './App.css'

interface NetworkPacket {
  id: number
  progress: number
  lossChance: number
  status: 'active' | 'lost'
  lossTtl: number
  dropProgress: number
  lane: number
  speedVar: number
  type: 'voice' | 'video' | 'data'
}

interface NetworkProfile {
  name: string
  id: string
  lossRate: number
  congestion: number
  speed: number
  description: string
}

const NETWORK_PROFILES: NetworkProfile[] = [
  { id: 'fiber', name: 'Fiber Optics', lossRate: 2, congestion: 10, speed: 1.5, description: 'Ultra-low latency, stable throughput.' },
  { id: 'starlink', name: 'Starlink', lossRate: 8, congestion: 40, speed: 1.0, description: 'Satellite relay with higher variance.' },
  { id: 'cellular', name: '5G Mobile', lossRate: 15, congestion: 60, speed: 1.2, description: 'High-speed but prone to interference.' },
  { id: 'mars', name: 'Deep Space', lossRate: 40, congestion: 95, speed: 0.4, description: 'Extreme distance, catastrophic loss.' },
]

const ProfileIcon = ({ id }: { id: string }) => {
  switch (id) {
    case 'fiber': return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
    case 'starlink': return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>
    case 'cellular': return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 20h.01"/><path d="M7 20v-4"/><path d="M12 20v-8"/><path d="M17 20V8"/><path d="M22 20V4"/></svg>
    case 'mars': return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2v20"/><path d="M2 12h20"/><path d="M12 12l5.5-5.5"/></svg>
    default: return null
  }
}

// Inline SVG components
const ServerIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>
)


const PacketIcon = () => (
  <div className="packet-square-box"></div>
)


const LostIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
)

function App() {
  const [packets, setPackets] = useState<NetworkPacket[]>([])
  const [stats, setStats] = useState({ throughput: 0, delay: 5, lossRate: 10, congestion: 30, sent: 0, delivered: 0 })
  const [isRunning, setIsRunning] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [packetTarget, setPacketTarget] = useState(20)
  const [queuedPackets, setQueuedPackets] = useState(0)
  const [lostTotal, setLostTotal] = useState(0)
  const [cwnd, setCwnd] = useState(1)
  const [ssthresh, setSsthresh] = useState(64)
  const [activeProfile, setActiveProfile] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<'all' | 'voice' | 'video' | 'data'>('all')
  
  // Chaos Engine State
  const [activeTab, setActiveTab] = useState<'simulation' | 'chaos' | 'history'>('simulation')
  const [isChaosEnabled, setIsChaosEnabled] = useState(false)
  const [activeEvent, setActiveEvent] = useState<{ type: string, label: string, color: string } | null>(null)
  const [eventLog, setEventLog] = useState<{ time: string, msg: string }[]>([])

  // Use refs for the simulation loop to prevent erratic interval resets
  const statsRef = useRef(stats)
  statsRef.current = stats
  const queuedRef = useRef(queuedPackets)
  queuedRef.current = queuedPackets
  const packetsRef = useRef(packets)
  packetsRef.current = packets
  const cwndRef = useRef(cwnd)
  cwndRef.current = cwnd
  const ssthreshRef = useRef(ssthresh)
  ssthreshRef.current = ssthresh

  const activePackets = packets.filter((p) => p.status === 'active').length
  const isTransferring = queuedPackets > 0 || packets.length > 0

  // Simulator animation loop
  useEffect(() => {
    if (!isRunning) return

    const interval = setInterval(() => {
      let newlyLost = 0
      let sentThisTick = 0
      let newlyDelivered = 0
      
      const currentStats = statsRef.current
      const currentEvent = activeEventRef.current

      // Chaos Overrides
      const effectiveLoss = currentEvent?.type === 'fiber-cut' ? 100 : currentStats.lossRate
      const effectiveCongestion = currentEvent?.type === 'ddos' ? 95 : currentStats.congestion
      const jitterMultiplier = currentEvent?.type === 'solar-flare' ? 5 : 1

      let currentPackets = packetsRef.current

      // TCP AIMD: Send packets if allowed by Congestion Window
      let activeCount = currentPackets.filter((p) => p.status === 'active').length
      while (queuedRef.current > 0 && activeCount < Math.floor(cwndRef.current)) {
        setQueuedPackets((prev) => Math.max(0, prev - 1))
        
        // QoS Logic: Assign a random or selected traffic type
        let type: 'voice' | 'video' | 'data'
        if (selectedType === 'all') {
            const rand = Math.random()
            type = rand < 0.33 ? 'voice' : rand < 0.66 ? 'video' : 'data'
        } else {
            type = selectedType as 'voice' | 'video' | 'data'
        }

        // Calculate loss exactly once at creation
        const baseLoss = statsRef.current.lossRate / 100
        const congestionLoss = (statsRef.current.congestion / 100) * 0.2
        let totalLossProb = Math.min(1.0, baseLoss + congestionLoss)

        // Apply Priority Resistance (QoS)
        if (type === 'voice') totalLossProb *= 0.05 // 95% resistance
        else if (type === 'video') totalLossProb *= 0.4 // 60% resistance

        const willBeLost = Math.random() < totalLossProb
        const dropProgress = willBeLost ? 30 + Math.random() * 40 : 200 // Drop anywhere 30-70

        const newPacket: NetworkPacket = {
          id: Date.now() + Math.random(),
          progress: 0,
          lossChance: statsRef.current.lossRate / 100,
          status: 'active',
          lossTtl: 0,
          dropProgress,
          lane: 20 + Math.random() * 60, // vertical percentage from 20% to 80%
          speedVar: 0.85 + Math.random() * 0.3, // 0.85x to 1.15x speed jitter
          type
        }
        
        sentThisTick += 1
        currentPackets = [...currentPackets, newPacket]
        activeCount++
      }

      const updated: NetworkPacket[] = []
      let cwndDelta = 0
      let experiencedDrop = false

      currentPackets.forEach((p) => {
        if (p.status === 'lost') {
          const nextTtl = p.lossTtl - 1
          if (nextTtl > 0) updated.push({ ...p, lossTtl: nextTtl })
          return
        }

        const jSpeed = speed * p.speedVar * jitterMultiplier
        const newProgress = p.progress + (0.8 + effectiveCongestion / 100) * jSpeed

        // Check if packet has passed its assigned drop progress within the loss zone
        const isLost = p.progress < p.dropProgress && newProgress >= p.dropProgress

        if (isLost || Math.random() < effectiveLoss / 1000) { // fiber-cut impact
          newlyLost += 1
          experiencedDrop = true
          updated.push({ ...p, progress: Math.min(newProgress, p.dropProgress), status: 'lost', lossTtl: 18 })
          return
        }

        // Packet reaches destination
        if (newProgress >= 100) {
          newlyDelivered += 1
          // TCP Additive Increase
          if (cwndRef.current < ssthreshRef.current) {
            cwndDelta += 1 // Slow Start
          } else {
            cwndDelta += 1 / Math.max(1, Math.floor(cwndRef.current)) // Congestion Avoidance
          }
          return
        }

        updated.push({ ...p, progress: newProgress })
      })

      setPackets(updated)

      // Apply TCP Window state changes
      if (experiencedDrop) {
        // TCP Multiplicative Decrease (Reno approach)
        const newSsthresh = Math.max(2, Math.floor(cwndRef.current / 2))
        setSsthresh(newSsthresh)
        setCwnd(newSsthresh) // Fast recovery
      } else if (cwndDelta > 0) {
        setCwnd((prev) => Math.min(256, prev + cwndDelta))
      }

      setPackets(updated)

      // Batch state updates to avoid race conditions
      if (sentThisTick > 0) {
        setStats((prev) => ({ ...prev, sent: prev.sent + sentThisTick }))
      }
      if (newlyLost > 0) {
        setLostTotal((prev) => prev + newlyLost)
      }
      if (newlyDelivered > 0) {
        setStats(prev => ({ ...prev, delivered: prev.delivered + newlyDelivered }))
      }

    }, 100 / speed)

    return () => clearInterval(interval)
  }, [isRunning, speed])

  useEffect(() => {
    setStats((prev) => {
      if (!isTransferring) return prev

      const throughput = Math.max(
        1,
        Math.round((activePackets * speed * (100 - prev.congestion)) / 2.5 + queuedPackets * 0.2)
      )
      const delay = Math.max(5, Math.round(8 + prev.congestion * 0.35 + activePackets * 0.4))

      return {
        ...prev,
        throughput,
        delay,
      }
    })
  }, [isTransferring, activePackets, queuedPackets, speed, stats.congestion])

  const congestionState =
    stats.congestion < 30 ? 'Low congestion' : stats.congestion < 65 ? 'Moderate congestion' : 'High congestion'

  const activeEventRef = useRef(activeEvent)
  useEffect(() => { activeEventRef.current = activeEvent }, [activeEvent])

  const triggerChaos = (type: string) => {
    const events: Record<string, any> = {
      'ddos': { type: 'ddos', label: 'DDoS Attack Active', color: '#ff4444' },
      'solar-flare': { type: 'solar-flare', label: 'Solar Flare Jitter', color: '#ffaa00' },
      'fiber-cut': { type: 'fiber-cut', label: 'Fiber Cut / Blackout', color: '#ffffff' }
    }
    const event = events[type]
    setActiveEvent(event)
    setEventLog(prev => [{ time: new Date().toLocaleTimeString(), msg: `EMERGENCY: ${event.label}` }, ...prev].slice(0, 10))
    
    // Auto-clear after 6 seconds
    setTimeout(() => setActiveEvent(null), 6000)
  }

  // Chaos Engine Loop
  useEffect(() => {
    if (!isChaosEnabled) return
    const id = setInterval(() => {
      if (Math.random() < 0.3 && !activeEvent) {
        const types = ['ddos', 'solar-flare', 'fiber-cut']
        triggerChaos(types[Math.floor(Math.random() * types.length)])
      }
    }, 5000)
    return () => clearInterval(id)
  }, [isChaosEnabled, activeEvent])

  const queuePacketBatch = () => {
    if (packetTarget <= 0) return
    setQueuedPackets((prev) => prev + packetTarget)
  }




  return (
    <div className="app glass-bg">
      <div className="ambient-glow bg-blur-1"></div>
      <div className="ambient-glow bg-blur-2"></div>

      {activeEvent && (
        <div className="chaos-banner" style={{ backgroundColor: activeEvent.color }}>
          <span className="warning-icon">⚠️</span> {activeEvent.label.toUpperCase()} IN PROGRESS
        </div>
      )}

      <header className="header glass-panel">
        <div className="header-content">
          <div className="header-main">
            <h1 className="neon-text">Congestion Control Visualizer</h1>
            <div className="tabs">
              <button
                className={`tab-btn ${activeTab === 'simulation' ? 'active' : ''}`}
                onClick={() => setActiveTab('simulation')}
              >
                Simulation
              </button>
              <button
                className={`tab-btn ${activeTab === 'chaos' ? 'active' : ''}`}
                onClick={() => setActiveTab('chaos')}
              >
                Chaos Lab
              </button>
              <button
                className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
                onClick={() => setActiveTab('history')}
              >
                Event Log
              </button>
            </div>
          </div>
        </div>
      </header>
      <main className="main-container">
        {activeTab === 'simulation' ? (
          <div className="tab-content simulation-tab">
            {/* Classic Full-Width Visualization at the TOP */}
            <section className="network-visualization glass-panel neon-border">
              <div className="network-diagram">
                <div className="node source-node">
                  <div className="node-icon-wrapper neon-box"><ServerIcon /></div>
                  <div className="node-label">Source Node</div>
                  <div className="node-stats">CWND: {Math.floor(cwnd)}</div>
                </div>

                <div className="channel-container">
                  <div className="channel-info">
                    <span className="label">Network Medium</span>
                  </div>
                  
                  <div className="channel">
                    <div className="loss-zone-indicator radar-scanner">
                      <div className="radar-beam"></div>
                      <span className="zone-label">Interference Zone</span>
                    </div>
                    
                    <div className="packets-flow">
                      {packets.map((packet) => (
                        <div
                          key={packet.id}
                          className={`packet-capsule ${packet.status === 'lost' ? 'lost' : 'active'} type-${packet.type}`}
                          style={{ left: `${packet.progress}%`, top: `${packet.lane}%`, transform: 'translate(-50%, -50%)' }}
                        >
                          {packet.status === 'lost' ? <LostIcon /> : <PacketIcon />}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="traffic-legend">
                    <div className="legend-item"><span className="dot voice"></span> Voice</div>
                    <div className="legend-item"><span className="dot video"></span> Video</div>
                    <div className="legend-item"><span className="dot data"></span> Bulk Data</div>
                  </div>
                </div>

                <div className="node destination-node">
                  <div className="node-icon-wrapper neon-box"><ServerIcon /></div>
                  <div className="node-label">Destination Node</div>
                  <div className="node-stats text-green">ACK: {stats.delivered}</div>
                </div>
              </div>
            </section>

            <div className="dashboard-grid">
              <div className="metrics-panel glass-panel">
                <div className="metrics-header">
                  <h3>Live Network Health</h3>
                  <div className={`global-status-banner ${stats.congestion > 70 ? 'danger' : stats.congestion > 40 ? 'warning' : 'secure'}`}>
                    <span className="status-dot"></span>
                    {stats.congestion > 70 ? 'SYSTEM OVERLOADED' : stats.congestion > 40 ? 'LINK CONGESTED' : 'OPERATIONAL: SECURE'}
                  </div>
                </div>
                <div className="health-telemetry-grid">
                  <div className="telemetry-card">
                    <div className="card-info">
                      <span className="telemetry-label">Throughput</span>
                      <span className="telemetry-value text-blue">{stats.throughput} pkts/s</span>
                    </div>
                  </div>
                  <div className="telemetry-card">
                    <div className="card-info">
                      <span className="telemetry-label">Net Latency</span>
                      <span className="telemetry-value text-warning">{stats.delay}ms</span>
                    </div>
                  </div>
                  <div className="telemetry-card">
                    <div className="card-info">
                      <span className="telemetry-label">Delivered</span>
                      <span className="telemetry-value text-green">{stats.delivered} pkts</span>
                    </div>
                  </div>
                  <div className="telemetry-card">
                    <div className="card-info">
                      <span className="telemetry-label">Lost Total</span>
                      <span className="telemetry-value text-red">{lostTotal} pkts</span>
                    </div>
                  </div>
                  <div className="telemetry-card">
                    <div className="card-info">
                      <span className="telemetry-label">In Transit</span>
                      <span className="telemetry-value text-blue">{packets.length} pkts</span>
                    </div>
                  </div>
                  <div className="telemetry-card">
                    <div className="card-info">
                      <span className="telemetry-label">ssthresh</span>
                      <span className="telemetry-value text-warning">{ssthresh}</span>
                    </div>
                  </div>
                  <div className="telemetry-card wide">
                    <div className="card-info">
                      <span className="telemetry-label">System Status</span>
                      <span className="telemetry-value text-blue">{congestionState}</span>
                    </div>
                  </div>
                </div>
                <div className="topology-panel glass-inset">
                  <div className="panel-header-mini">Logical Link Topology</div>
                  <div className="topology-container">
                    <svg viewBox="0 0 400 120" className="topology-svg">
                      <defs>
                        <filter id="glow">
                          <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
                          <feMerge>
                            <feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/>
                          </feMerge>
                        </filter>
                      </defs>
                      
                      {/* Connections */}
                      <path d="M 60 60 L 160 60" className="topo-link" stroke={stats.throughput > 40 ? 'var(--color-success)' : 'var(--color-warning)'} />
                      <path d="M 240 60 L 340 60" className="topo-link" stroke={stats.throughput > 40 ? 'var(--color-success)' : 'var(--color-warning)'} strokeDasharray="5,3" />

                      {/* Nodes */}
                      <g className="topo-node-group">
                        <circle cx="60" cy="60" r="15" className="topo-circle host" filter="url(#glow)" />
                        <text x="60" y="95" className="topo-text">HOST</text>
                      </g>

                      <g className="topo-node-group">
                        <rect x="160" y="40" width="80" height="40" rx="8" className="topo-rect backbone" filter="url(#glow)" />
                        <text x="200" y="65" className="topo-text-inner">BACKBONE</text>
                      </g>

                      <g className="topo-node-group">
                        <circle cx="340" cy="60" r="15" className="topo-circle edge" filter="url(#glow)" />
                        <text x="340" y="95" className="topo-text">EDGE</text>
                      </g>
                    </svg>
                  </div>
                </div>

              </div>

              <div className="controls-panel glass-panel">
                <div className="control-groups">
                  <div className="control-item">
                    <div className="control-header">
                      <label>Network Congestion</label>
                      <span className="value">{stats.congestion}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={stats.congestion}
                      onChange={(e) => setStats((prev) => ({ ...prev, congestion: parseInt(e.target.value) }))}
                      className="glass-slider"
                    />
                  </div>

                  <div className="control-item">
                    <div className="control-header">
                      <label>Base Loss Rate</label>
                      <span className="value">{stats.lossRate}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      value={stats.lossRate}
                      onChange={(e) =>
                        setStats((prev) => ({ ...prev, lossRate: parseInt(e.target.value) }))
                      }
                      className="glass-slider"
                    />
                  </div>

                  <div className="control-item">
                    <div className="control-header">
                      <label>Active Network Environment</label>
                      <span className="value">{activeProfile || 'Custom'}</span>
                    </div>
                    <div className="environment-grid">
                      {NETWORK_PROFILES.map((profile) => (
                        <button
                          key={profile.id}
                          className={`env-card ${activeProfile === profile.id ? 'active' : ''}`}
                          onClick={() => {
                            setActiveProfile(profile.id);
                            setStats((prev) => ({
                              ...prev,
                              lossRate: profile.lossRate,
                              congestion: profile.congestion,
                            }));
                            setSpeed(profile.speed);
                          }}
                        >
                          <div className="env-card-icon">
                            <ProfileIcon id={profile.id} />
                          </div>
                          <span className="env-name">{profile.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="control-item">
                    <div className="control-header">
                      <label>Traffic Fleet Deployment</label>
                      <span className="queued">Ready: {queuedPackets}</span>
                    </div>
                    <div className="traffic-dispatch-box">
                      <div className="traffic-selector-grid">
                        <button className={`traffic-option ${selectedType === 'all' ? 'active' : ''}`} onClick={() => setSelectedType('all')}>
                          <div className="option-sq mix"></div>
                          <span>Mixed</span>
                        </button>
                        <button className={`traffic-option ${selectedType === 'voice' ? 'active' : ''}`} onClick={() => setSelectedType('voice')}>
                          <div className="option-sq voice"></div>
                          <span>Voice</span>
                        </button>
                        <button className={`traffic-option ${selectedType === 'video' ? 'active' : ''}`} onClick={() => setSelectedType('video')}>
                          <div className="option-sq video"></div>
                          <span>Video</span>
                        </button>
                        <button className={`traffic-option ${selectedType === 'data' ? 'active' : ''}`} onClick={() => setSelectedType('data')}>
                          <div className="option-sq data"></div>
                          <span>Bulk</span>
                        </button>
                      </div>
                      <div className="dispatch-controls">
                        <input
                          type="number"
                          min="1"
                          max="500"
                          value={packetTarget}
                          onChange={(e) => setPacketTarget(Math.max(1, Number(e.target.value) || 1))}
                          className="glass-input dispatch-input"
                        />
                        <button className="neon-button primary dispatch-btn" onClick={queuePacketBatch}>
                          DEPLOY FLEET
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="action-row">
                    <button className="neon-button outline" onClick={() => {
                        setPackets([])
                        // Reset simulation state for Solar Flare recovery
                        setQueuedPackets(0)
                        setLostTotal(0)
                        setCwnd(1)
                        setStats(prev => ({ ...prev, throughput: 0, lossRate: 10, congestion: 30, delivered: 0 }))
                      }}>
                      RESET SIM
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === 'chaos' ? (
          <div className="tab-content chaos-tab">
            <div className="chaos-grid">
              <div className="chaos-controls glass-panel">
                <h2 className="neon-text">Chaos Lab</h2>
                <p className="text-muted">Test system resilience under extreme environmental stress.</p>
                <div className="chaos-toggle-box">
                  <label className="chaos-switch">
                    <input 
                      type="checkbox" 
                      checked={isChaosEnabled}
                      onChange={(e) => {
                        setIsChaosEnabled(e.target.checked)
                        if (!e.target.checked) setActiveEvent(null)
                      }}
                    />
                    <span className="slider round"></span>
                  </label>
                  <span>Autonomous Chaos Mode</span>
                </div>
                <div className="manual-triggers">
                  <h3>Manual Stress Triggers</h3>
                  <div className="trigger-buttons">
                    <button className="chaos-trigger ddos" onClick={() => triggerChaos('ddos')}>💀 DDoS Attack</button>
                    <button className="chaos-trigger solar" onClick={() => triggerChaos('solar-flare')}>☀️ Solar Flare</button>
                    <button className="chaos-trigger cut" onClick={() => triggerChaos('fiber-cut')}>✂️ Fiber Cut</button>
                  </div>
                </div>
              </div>
            </div>
            <div className="chaos-footer glass-panel">
              <div className="control-item">
                <div className="control-header">
                  <label>Simulation Speed</label>
                  <span className="value">{speed}x</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="3"
                  step="0.5"
                  value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="glass-slider"
                />
              </div>
              <div className="action-row">
                <button 
                  className={`neon-button ${isRunning ? 'danger' : 'success'}`}
                  onClick={() => setIsRunning(!isRunning)}
                >
                  {isRunning ? 'PAUSE SYSTEM' : 'RESUME SYSTEM'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="tab-content history-tab">
            <div className="chaos-log glass-panel full-width">
                <h3>Event History Log</h3>
                <div className="log-entries">
                  {eventLog.length === 0 && <p className="text-muted">No events recorded.</p>}
                  {eventLog.map((log, i) => (
                    <div key={i} className="log-entry">
                      <span className="log-time">[{log.time}]</span> {log.msg}
                    </div>
                  ))}
                </div>
              </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
