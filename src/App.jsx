import { useEffect, useRef, useState } from 'react'
import { createStompClient, subscribeBlueprint } from './lib/stompClient.js'
import { createSocket } from './lib/socketIoClient.js'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8080'
const IO_BASE  = import.meta.env.VITE_IO_BASE  ?? 'http://localhost:3001'

export default function App() {
  const [tech, setTech] = useState('stomp')
  const [author, setAuthor] = useState('john')
  const [name, setName]     = useState('house')

  // valores activos — se actualizan 600ms después de que el usuario deja de escribir
  const [active, setActive] = useState({ author: 'john', name: 'house', tech: 'stomp' })

  const canvasRef = useRef(null)
  const stompRef  = useRef(null)
  const unsubRef  = useRef(null)
  const socketRef = useRef(null)

  // debounce: espera 600ms después del último cambio antes de reconectar
  useEffect(() => {
    if (!author.trim() || !name.trim()) return
    const timer = setTimeout(() => {
      setActive({ author: author.trim(), name: name.trim(), tech })
    }, 600)
    return () => clearTimeout(timer)
  }, [author, name, tech])

  function drawAll(bp) {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !bp?.points) return
    ctx.clearRect(0, 0, 600, 400)
    // dibuja un punto visible en cada coordenada
    bp.points.forEach(p => {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 4, 0, 2 * Math.PI)
      ctx.fill()
    })
    // conecta los puntos con líneas si hay más de uno
    if (bp.points.length > 1) {
      ctx.beginPath()
      bp.points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y)
      })
      ctx.stroke()
    }
  }

  // carga estado inicial cuando cambia el plano activo
  useEffect(() => {
    const base = active.tech === 'stomp' ? API_BASE : IO_BASE
    fetch(`${base}/api/blueprints/${active.author}/${active.name}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) drawAll(data) })
      .catch(() => {})
  }, [active])

  // conecta/reconecta RT cuando cambia el plano activo
  useEffect(() => {
    unsubRef.current?.unsubscribe?.(); unsubRef.current = null
    stompRef.current?.deactivate?.(); stompRef.current = null
    socketRef.current?.disconnect?.(); socketRef.current = null

    if (active.tech === 'stomp') {
      const client = createStompClient(API_BASE)
      stompRef.current = client
      client.onConnect = () => {
        unsubRef.current = subscribeBlueprint(client, active.author, active.name, upd => {
          drawAll({ points: upd.points })
        })
      }
      client.activate()
    } else {
      const s = createSocket(IO_BASE)
      socketRef.current = s
      const room = `blueprints.${active.author}.${active.name}`
      s.emit('join-room', room)
      s.on('blueprint-update', upd => drawAll({ points: upd.points }))
    }

    return () => {
      unsubRef.current?.unsubscribe?.(); unsubRef.current = null
      stompRef.current?.deactivate?.()
      socketRef.current?.disconnect?.()
    }
  }, [active])

  function onClick(e) {
    const rect  = e.target.getBoundingClientRect()
    const point = { x: Math.round(e.clientX - rect.left), y: Math.round(e.clientY - rect.top) }

    if (active.tech === 'stomp' && stompRef.current?.connected) {
      stompRef.current.publish({
        destination: '/app/draw',
        body: JSON.stringify({ author: active.author, name: active.name, point })
      })
    } else if (active.tech === 'socketio' && socketRef.current?.connected) {
      const room = `blueprints.${active.author}.${active.name}`
      socketRef.current.emit('draw-event', { room, author: active.author, name: active.name, point })
    }
  }

  return (
    <div style={{ fontFamily: 'Inter, system-ui', padding: 16, maxWidth: 900 }}>
      <h2>BluePrints RT – Socket.IO vs STOMP</h2>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <label>Tecnología:</label>
        <select value={tech} onChange={e => setTech(e.target.value)}>
          <option value="stomp">STOMP (Spring)</option>
          <option value="socketio">Socket.IO (Node)</option>
        </select>
        <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="autor" />
        <input value={name}   onChange={e => setName(e.target.value)}   placeholder="plano" />
      </div>
      <canvas
        ref={canvasRef}
        width={600}
        height={400}
        style={{ border: '1px solid #ddd', borderRadius: 12, display: 'block' }}
        onClick={onClick}
      />
      <p style={{ opacity: 0.7, marginTop: 8 }}>
        Tip: abre 2 pestañas con el mismo autor/plano y dibuja alternando para ver la colaboración.
      </p>
    </div>
  )
}
