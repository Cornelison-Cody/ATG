"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Gamepad2, Zap, Palette } from "lucide-react";
import styles from "./page.module.css";

const BACKGROUNDS = [
  { id: "hero-bg", name: "Azure Tides", src: "/images/hero-bg.png" },
  { id: "cyberpunk", name: "Cyberpunk City", src: "/images/cyberpunk-city.png" },
  { id: "abstract", name: "Abstract Waves", src: "/images/abstract-waves.png" },
  { id: "synthwave", name: "Synthwave Sunset", src: "/images/synthwave-sunset.png" },
  { id: "connected", name: "Connected Phones", src: "/images/connected-phones.png" }
];

export default function LandingPage() {
  const [bgImage, setBgImage] = useState(BACKGROUNDS[0].src);

  return (
    <main className={styles.container}>
      <div className={styles.bgSelector}>
        <label htmlFor="bg-select">Theme Preview:</label>
        <select 
          id="bg-select"
          value={bgImage} 
          onChange={(e) => setBgImage(e.target.value)}
          className={styles.select}
        >
          {BACKGROUNDS.map((bg) => (
            <option key={bg.id} value={bg.src}>{bg.name}</option>
          ))}
        </select>
      </div>

      <section className={styles.hero}>
        <Image
          src={bgImage}
          alt="Futuristic hero background"
          fill
          priority
          className={styles.heroBackground}
        />
        <div className={styles.heroOverlay} />
        
        <div className={styles.content}>
          <h1 className={styles.title}>Azure Tides Gaming</h1>
          <p className={styles.subtitle}>
            Dive into the next generation of real-time multiplayer experiences. 
            Where immersive worlds meet cutting-edge web technology.
          </p>
          <div className={styles.actions}>
            <Link href="/dashboard" className={styles.primaryButton}>
              Create Account
            </Link>
            <Link href="/dashboard" className={styles.secondaryButton}>
              Sign In
            </Link>
          </div>
        </div>
      </section>

      <section className={styles.features}>
        <div className={styles.featuresGrid}>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>
              <Zap size={24} />
            </div>
            <h3 className={styles.featureTitle}>Lightning Fast Lobbies</h3>
            <p className={styles.featureDescription}>
              Experience zero-latency real-time interactions with our optimized WebSocket architecture. Jump straight into the action.
            </p>
          </div>
          
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>
              <Gamepad2 size={24} />
            </div>
            <h3 className={styles.featureTitle}>Immersive Gameplay</h3>
            <p className={styles.featureDescription}>
              Join a universe of interactive party games right from your phone while watching the main action unfold on the big screen.
            </p>
          </div>
          
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>
              <Palette size={24} />
            </div>
            <h3 className={styles.featureTitle}>AI-Powered Creator</h3>
            <p className={styles.featureDescription}>
              Build and customize your own game modes instantly with our built-in Codex integration. Your imagination is the only limit.
            </p>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <p>&copy; {new Date().getFullYear()} Azure Tides Gaming. All rights reserved.</p>
      </footer>
    </main>
  );
}
