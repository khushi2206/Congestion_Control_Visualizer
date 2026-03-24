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

// Inline SVG components
const ServerIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>
)

const MonitorIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
)

const PacketIcon = () => (
  <div className="packet-square-box"></div>
)

const LostIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
)

function App() {
  const [packets, setPackets] = useState<NetworkPacket[]>([])
  const [stats, setStats] = useState({ throughput: 0, delay: 5, lossRate: 10, congestion: 30, sent: 0 })
  const [isRunning, setIsRunning] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [packetTarget, setPacketTarget] = useState(20)
  const [queuedPackets, setQueuedPackets] = useState(0)
  const [lostTotal, setLostTotal] = useState(0)
  const [cwnd, setCwnd] = useState(1)
  const [ssthresh, setSsthresh] = useState(64)
  const [history, setHistory] = useState<{cwnd: number, throughput: number}[]>([])
  const [activeProfile, setActiveProfile] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<'all' | 'voice' | 'video' | 'data'>('all')

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

        // Jitter Physics: Apply individual speed variance to progress
        const jitteredSpeed = speed * p.speedVar
        const newProgress = p.progress + (0.8 + statsRef.current.congestion / 100) * jitteredSpeed

        // Check if packet has passed its assigned drop progress within the loss zone
        const isLost = p.progress < p.dropProgress && newProgress >= p.dropProgress

        if (isLost) {
          newlyLost += 1
          experiencedDrop = true
          updated.push({ ...p, progress: p.dropProgress, status: 'lost', lossTtl: 18 })
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

  // Oscilloscope Graph telemetry loop
  useEffect(() => {
    if (!isRunning) return
    const graphInterval = setInterval(() => {
      setHistory(prev => {
        const next = [...prev, { cwnd: Math.floor(cwndRef.current), throughput: statsRef.current.throughput }]
        if (next.length > 30) return next.slice(next.length - 30)
        return next
      })
    }, 500)
    return () => clearInterval(graphInterval)
  }, [isRunning])

  // Calculated metrics strictly per FORMULAS.md
  // Using deliveredTotal is safer for the UI visually, but let's adhere strictly to formula if required.
  // Formula: max(0, sent - lostTotal - activePackets). This gives perfect math.
  const deliveredPackets = Math.max(0, stats.sent - lostTotal - activePackets)
  const lostPackets = packets.filter((p) => p.status === 'lost').length
  const observedLossRate = stats.sent > 0 ? (lostTotal / stats.sent) * 100 : 0

  const congestionState =
    stats.congestion < 30 ? 'Low congestion' : stats.congestion < 65 ? 'Moderate congestion' : 'High congestion'

  const queuePacketBatch = () => {
    if (packetTarget <= 0) return
    setQueuedPackets((prev) => prev + packetTarget)
  }

  const applyProfile = (profile: NetworkProfile) => {
    setActiveProfile(profile.id)
    setStats(prev => ({ ...prev, lossRate: profile.lossRate, congestion: profile.congestion }))
    setSpeed(profile.speed)
  }

  return (
    <div className="app glass-bg">
      <div className="ambient-glow bg-blur-1"></div>
      <div className="ambient-glow bg-blur-2"></div>
      <div className="ambient-glow bg-blur-3"></div>

      <header className="header glass-panel">
        <div className="header-content">
          <h1 className="neon-text">Congestion Control Visualizer</h1>
          <div className="profile-selector">
            {NETWORK_PROFILES.map((profile) => (
              <button
                key={profile.id}
                className={`profile-btn ${activeProfile === profile.id ? 'active' : ''}`}
                onClick={() => applyProfile(profile)}
                title={profile.description}
              >
                {profile.name}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="main-container">
        {/* Top: Network Visualization */}
        <section className="network-visualization glass-panel neon-border">
          <div className="network-diagram">
            <div className="node source-node">
              <div 
                className="cwnd-ring" 
                style={{ 
                  transform: `scale(${1 + Math.min(4, cwnd / 20)})`,
                  opacity: Math.max(0.1, 1 - cwnd / 100)
                }} 
              />
              <div className="node-icon-wrapper neon-box"><ServerIcon /></div>
              <div className="node-label">Source Node</div>
              <div className="node-stats">CWND: {Math.floor(cwnd)}</div>
            </div>

            <div className="channel-container">
              <div className="channel-info">
                <span className="label">Network Medium</span>
                <span className={`congestion-tag ${stats.congestion > 65 ? 'high' : stats.congestion > 30 ? 'med' : 'low'}`}>
                  Congestion: {Math.round(stats.congestion)}%
                </span>
              </div>
              
              <div className="channel">
                <div className="loss-zone-indicator">
                  <span className="zone-label">Loss Zone</span>
                </div>
                <div className="packets-flow">
                  {packets.map((packet) => (
                    <div
                      key={packet.id}
                      className={`packet-capsule ${packet.status === 'lost' ? 'lost' : 'active'} type-${packet.type}`}
                      style={{ 
                        left: `${packet.progress}%`,
                        top: `${packet.lane}%`,
                        transform: 'translate(-50%, -50%)'
                      }}
                    >
                      {packet.status === 'lost' ? <LostIcon /> : <PacketIcon />}
                    </div>
                  ))}
                </div>
              </div>

              <div className="traffic-legend">
                <div className="legend-item"><span className="dot voice"></span> Voice (High Prio)</div>
                <div className="legend-item"><span className="dot video"></span> Video (Med Prio)</div>
                <div className="legend-item"><span className="dot data"></span> Bulk Data (Low Prio)</div>
              </div>
            </div>

            <div className="node destination-node">
              <div className="node-icon-wrapper neon-box"><MonitorIcon /></div>
              <div className="node-label">Destination Node</div>
              <div className="node-stats">Received: {deliveredPackets}</div>
            </div>
          </div>
        </section>

        <div className="dashboard-grid">
          {/* Left: Metrics & Analytics */}
          <section className="metrics-panel glass-panel">
            <div className="panel-header">
              <h2>Real-Time Metrics</h2>
            </div>
            
            {/* Show all strictly tracked metrics here perfectly */}
            <div className="metrics-grid">
              <div className="metric-card">
                <div className="metric-label">Throughput</div>
                <div className="metric-value text-blue">{stats.throughput} <span className="unit">Mbps</span></div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Latency</div>
                <div className="metric-value text-blue">{Math.round(stats.delay)} <span className="unit">ms</span></div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Packets Sent</div>
                <div className="metric-value text-primary">{stats.sent} <span className="unit">pkts</span></div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Delivered</div>
                <div className="metric-value text-green">{deliveredPackets} <span className="unit">pkts</span></div>
              </div>
              <div className="metric-card">
                <div className="metric-label">In Transit</div>
                <div className="metric-value text-warning">{activePackets} <span className="unit">pkts</span></div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Total Lost</div>
                <div className="metric-value text-red">{lostTotal} <span className="unit">pkts</span></div>
              </div>
            </div>

            <div className="analysis-feed glass-inset">
              <h3>Formula Analysis</h3>
              <ul>
                <li><strong>State:</strong> {congestionState}</li>
                <li><strong>Configured Loss (Input):</strong> {stats.lossRate}%</li>
                <li><strong>Observed Loss Rate:</strong> {observedLossRate.toFixed(1)}%</li>
                <li><strong>Lost Markers Currently Visible:</strong> {lostPackets}</li>
                <li><strong>Formula Sync:</strong> Sent ({stats.sent}) = Delivered ({deliveredPackets}) + Lost ({lostTotal}) + Active ({activePackets})</li>
              </ul>
              <div className={`status-message ${stats.congestion > 65 ? 'alert' : observedLossRate > 20 ? 'warn' : 'ok'}`}>
                {stats.congestion > 65
                  ? '⚠️ Critical network load. Packet drop rate elevated.'
                  : observedLossRate > 20
                    ? '⚠️ Packet loss detected. Consider adjusting load parameters.'
                    : '✅ Network conditions optimal. Smooth transmission.'}
              </div>
            </div>

            <div className="oscilloscope-graph glass-inset">
              <h3 className="graph-title">TCP CWND & Throughput Telemetry</h3>
              <div className="svg-graph-container">
                <svg viewBox="0 0 300 100" preserveAspectRatio="none" className="live-graph">
                  {/* Grid Lines */}
                  {[...Array(5)].map((_, i) => (
                    <line key={i} x1="0" y1={i * 25} x2="300" y2={i * 25} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                  ))}
                  
                  {/* Throughput Polyline (Cyan) */}
                  <polyline
                    fill="none"
                    stroke="var(--color-cyan)"
                    strokeWidth="2"
                    points={history.map((pt, i) => `${i * 10},${100 - Math.min(100, pt.throughput / 5)}`).join(' ')}
                    style={{ filter: "drop-shadow(0 0 4px var(--color-cyan-glow))" }}
                  />
                  
                  {/* CWND Polyline (Warning/Yellow) */}
                  <polyline
                    fill="none"
                    stroke="var(--color-warning)"
                    strokeWidth="2"
                    points={history.map((pt, i) => `${i * 10},${100 - Math.min(100, pt.cwnd)}`).join(' ')}
                    style={{ filter: "drop-shadow(0 0 4px var(--color-warning-glow))" }}
                  />
                </svg>
                <div className="graph-legend">
                  <span className="legend-item"><span className="dot cyan"></span> Throughput</span>
                  <span className="legend-item"><span className="dot warning"></span> CWND Limit</span>
                </div>
              </div>
            </div>
          </section>

          {/* Right: Controls */}
          <section className="controls-panel glass-panel">
            <div className="panel-header">
              <h2>Parameters</h2>
            </div>
            
            <div className="control-groups">
              <div className="control-item">
                <div className="control-header">
                  <label>Traffic Generator</label>
                  <span className="queued">Queued: {queuedPackets}</span>
                </div>
                <div className="input-row">
                  <select 
                    value={selectedType} 
                    onChange={(e) => setSelectedType(e.target.value as any)}
                    className="glass-input type-select"
                  >
                    <option value="all">Mix Traffic</option>
                    <option value="voice">💓 Voice Only</option>
                    <option value="video">🎬 Video Only</option>
                    <option value="data">📦 Bulk Data Only</option>
                  </select>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={packetTarget}
                    onChange={(e) => setPacketTarget(Math.max(1, Number(e.target.value) || 1))}
                    className="glass-input num-input"
                  />
                  <button className="neon-button primary" onClick={queuePacketBatch}>
                    Deploy
                  </button>
                </div>
              </div>

              <div className="control-item">
                <div className="control-header">
                  <label>Network Congestion</label>
                  <span className="value">{Math.round(stats.congestion)}%</span>
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
                  onChange={(e) => setStats((prev) => ({ ...prev, lossRate: parseInt(e.target.value) }))}
                  className="glass-slider"
                />
              </div>

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
                <button 
                  className="neon-button outline"
                  onClick={() => {
                    setPackets([])
                    setQueuedPackets(0)
                    setLostTotal(0)
                    setCwnd(1)
                    setHistory([])
                    setStats({ throughput: 0, delay: 5, lossRate: Math.max(0, Math.min(50, stats.lossRate)), congestion: Math.max(0, Math.min(100, stats.congestion)), sent: 0 })
                  }}
                >
                  RESET
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

export default App
