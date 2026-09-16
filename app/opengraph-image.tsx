import { ImageResponse } from 'next/og'

export const alt = 'NoTrace — Your media. Your control. Frontend prototype.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export default function Image() {
  return new ImageResponse(<div style={{ width: '100%', height: '100%', background: '#090a10', color: '#f0f0f6', display: 'flex', flexDirection: 'column', padding: 70, justifyContent: 'center' }}><div style={{ display:'flex', fontSize: 20, color:'#b4a5f6', letterSpacing: 5 }}>LESS EXPOSURE. MORE CONTROL.</div><div style={{ display:'flex', fontSize: 138, letterSpacing: -9, marginTop: 35 }}>NO TRACE<span style={{ color:'#b4a5f6' }}>.</span></div><div style={{ display:'flex', fontSize: 31, color:'#9293a5', marginTop: 20 }}>Your media stays on this device.</div><div style={{ display:'flex', fontSize: 18, color:'#9293a5', marginTop: 65 }}>Inspect · Remove · Edit · Verify — UI prototype</div></div>, size)
}
