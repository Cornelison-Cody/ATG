"use client";

import Image from "next/image";
import Link from "next/link";
import { Gamepad2, Zap, Palette } from "lucide-react";
import styles from "./page.module.css";

export default function LandingPage() {
  return (
    <main className={styles.container}>
      <section className={styles.hero}>
        <Image
          src="/images/hero-bg.png"
          alt="Azure Tides hero background"
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
