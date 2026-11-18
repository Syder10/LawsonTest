"use client"

import { useEffect, useRef } from "react"
import * as THREE from "three"

interface Mvp3DSceneProps {
  isMe?: boolean
}

export default function Mvp3DScene({ isMe = false }: Mvp3DSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const width = container.clientWidth || 280
    const height = container.clientHeight || 180

    // ── Scene & Camera ──────────────────────────────────────────────────────────
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
    camera.position.set(0, 0.5, 4.2)
    camera.lookAt(0, 0.2, 0)

    // ── Renderer ───────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.3
    container.appendChild(renderer.domElement)

    // ── Lights ─────────────────────────────────────────────────────────────────
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8)
    scene.add(ambientLight)

    const keyLight = new THREE.DirectionalLight(0xfff3d1, 2.5)
    keyLight.position.set(3, 4, 3)
    scene.add(keyLight)

    const rimLight = new THREE.DirectionalLight(0xff9900, 1.8)
    rimLight.position.set(-3, -2, -2)
    scene.add(rimLight)

    const spotLight = new THREE.PointLight(0xffffff, 2, 8)
    spotLight.position.set(0, 2, 2)
    scene.add(spotLight)

    // ── Gold Materials ─────────────────────────────────────────────────────────
    const goldMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd13b,
      metalness: 0.92,
      roughness: 0.18,
    })

    const darkBaseMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a24,
      metalness: 0.6,
      roughness: 0.35,
    })

    const crownRubyMaterial = new THREE.MeshStandardMaterial({
      color: isMe ? 0x00e676 : 0xe53935,
      metalness: 0.3,
      roughness: 0.1,
    })

    // ── Trophy / Crown Group ───────────────────────────────────────────────────
    const trophyGroup = new THREE.Group()

    // 1. Pedestal Base
    const baseGeo = new THREE.CylinderGeometry(0.7, 0.85, 0.2, 24)
    const baseMesh = new THREE.Mesh(baseGeo, darkBaseMaterial)
    baseMesh.position.y = -0.9
    trophyGroup.add(baseMesh)

    const baseRingGeo = new THREE.TorusGeometry(0.72, 0.04, 16, 32)
    const baseRingMesh = new THREE.Mesh(baseRingGeo, goldMaterial)
    baseRingMesh.rotation.x = Math.PI / 2
    baseRingMesh.position.y = -0.8
    trophyGroup.add(baseRingMesh)

    // 2. Stem
    const stemGeo = new THREE.CylinderGeometry(0.18, 0.26, 0.5, 16)
    const stemMesh = new THREE.Mesh(stemGeo, goldMaterial)
    stemMesh.position.y = -0.5
    trophyGroup.add(stemMesh)

    // 3. Central Cup / Chalice Bowl
    const cupGeo = new THREE.CylinderGeometry(0.72, 0.28, 0.75, 24, 1, true)
    const cupMesh = new THREE.Mesh(cupGeo, goldMaterial)
    cupMesh.position.y = 0.05
    trophyGroup.add(cupMesh)

    const cupBottomGeo = new THREE.SphereGeometry(0.3, 16, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)
    const cupBottomMesh = new THREE.Mesh(cupBottomGeo, goldMaterial)
    cupBottomMesh.position.y = -0.28
    cupBottomMesh.rotation.x = Math.PI
    trophyGroup.add(cupBottomMesh)

    // 4. Cup Handles (Left & Right Torus arcs)
    const handleGeo = new THREE.TorusGeometry(0.35, 0.05, 12, 24, Math.PI)
    const leftHandle = new THREE.Mesh(handleGeo, goldMaterial)
    leftHandle.position.set(-0.7, 0.05, 0)
    leftHandle.rotation.z = Math.PI / 2
    trophyGroup.add(leftHandle)

    const rightHandle = new THREE.Mesh(handleGeo, goldMaterial)
    rightHandle.position.set(0.7, 0.05, 0)
    rightHandle.rotation.z = -Math.PI / 2
    trophyGroup.add(rightHandle)

    // 5. Crown on top of cup
    const crownBaseGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.12, 24)
    const crownBase = new THREE.Mesh(crownBaseGeo, goldMaterial)
    crownBase.position.y = 0.48
    trophyGroup.add(crownBase)

    // 5 Crown Points
    const numPoints = 5
    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2
      const radius = 0.45
      const spikeGeo = new THREE.ConeGeometry(0.09, 0.26, 12)
      const spike = new THREE.Mesh(spikeGeo, goldMaterial)
      spike.position.set(Math.cos(angle) * radius, 0.65, Math.sin(angle) * radius)
      trophyGroup.add(spike)

      // Gem atop each point
      const gemGeo = new THREE.SphereGeometry(0.045, 10, 10)
      const gem = new THREE.Mesh(gemGeo, crownRubyMaterial)
      gem.position.set(Math.cos(angle) * radius, 0.8, Math.sin(angle) * radius)
      trophyGroup.add(gem)
    }

    // 6. Center Star / Gem inside the Crown
    const starCoreGeo = new THREE.OctahedronGeometry(0.2, 0)
    const starCore = new THREE.Mesh(starCoreGeo, crownRubyMaterial)
    starCore.position.y = 0.52
    trophyGroup.add(starCore)

    scene.add(trophyGroup)

    // ── Floating Golden Particle Sparks ─────────────────────────────────────────
    const particleCount = 45
    const particleGeo = new THREE.BufferGeometry()
    const particlePositions = new Float32Array(particleCount * 3)
    const particleSpeeds = new Float32Array(particleCount)

    for (let i = 0; i < particleCount; i++) {
      particlePositions[i * 3] = (Math.random() - 0.5) * 3.2
      particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 2.5
      particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 2
      particleSpeeds[i] = 0.005 + Math.random() * 0.012
    }
    particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3))

    const particleMat = new THREE.PointsMaterial({
      color: 0xffe066,
      size: 0.055,
      transparent: true,
      opacity: 0.85,
    })
    const particles = new THREE.Points(particleGeo, particleMat)
    scene.add(particles)

    // ── Interactive Drag to Rotate ──────────────────────────────────────────────
    let isDragging = false
    let prevMouseX = 0
    let dragVelocity = 0

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true
      prevMouseX = e.clientX
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return
      const deltaX = e.clientX - prevMouseX
      prevMouseX = e.clientX
      trophyGroup.rotation.y += deltaX * 0.015
      dragVelocity = deltaX * 0.008
    }

    const onPointerUp = () => {
      isDragging = false
    }

    container.addEventListener("pointerdown", onPointerDown)
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)

    // ── Animation Loop ──────────────────────────────────────────────────────────
    let animId = 0
    const clock = new THREE.Clock()

    const animate = () => {
      animId = requestAnimationFrame(animate)
      const elapsed = clock.getElapsedTime()

      // Idle spin + inertia decay
      if (!isDragging) {
        dragVelocity *= 0.94
        trophyGroup.rotation.y += 0.016 + dragVelocity
      }

      // Gentle floating bob
      trophyGroup.position.y = Math.sin(elapsed * 2.2) * 0.08

      // Star core pulse
      starCore.rotation.y = elapsed * 1.5
      starCore.rotation.z = Math.sin(elapsed * 2) * 0.2

      // Animate particles drifting upward
      const positions = particleGeo.attributes.position.array as Float32Array
      for (let i = 0; i < particleCount; i++) {
        positions[i * 3 + 1] += particleSpeeds[i]
        if (positions[i * 3 + 1] > 1.8) {
          positions[i * 3 + 1] = -1.4
          positions[i * 3] = (Math.random() - 0.5) * 3.2
        }
      }
      particleGeo.attributes.position.needsUpdate = true

      renderer.render(scene, camera)
    }
    animate()

    // ── Resize Observer ────────────────────────────────────────────────────────
    const resizeObserver = new ResizeObserver(() => {
      if (!container) return
      const w = container.clientWidth
      const h = container.clientHeight
      if (w === 0 || h === 0) return
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    })
    resizeObserver.observe(container)

    // ── Clean Disposal ─────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(animId)
      resizeObserver.disconnect()

      container.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)

      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose())
          } else {
            obj.material.dispose()
          }
        }
      })
      particleGeo.dispose()
      particleMat.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement)
      }
    }
  }, [isMe])

  return (
    <div
      ref={containerRef}
      className="relative w-full h-44 sm:h-48 cursor-grab active:cursor-grabbing select-none flex items-center justify-center overflow-hidden"
      aria-label="3D Interactive MVP Trophy"
    >
      <div className="absolute bottom-1 right-2 pointer-events-none text-[10px] font-bold text-white/50 tracking-wider uppercase">
        Drag to spin ✦
      </div>
    </div>
  )
}
