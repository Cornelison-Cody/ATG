"use client";

import Image from "next/image";
import Link from "next/link";
import { MonitorSmartphone, Sparkles, Tv } from "lucide-react";
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
            Create party games with Codex, show the main game on a TV, and let players join from their phones.
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

      <section className={styles.howItWorks} aria-labelledby="how-it-works-title">
        <div className={styles.sectionHeader}>
          <h2 id="how-it-works-title">How ATG Works</h2>
          <p>
            You do not need to write code. Start with a game idea, use Plan mode to shape the rules, then
            ask Codex to build the TV display and phone controller.
          </p>
        </div>
        <div className={styles.stepsGrid}>
          <article className={styles.stepCard}>
            <span className={styles.stepNumber}>1</span>
            <h3>Create a game</h3>
            <p>Name the game you want to make. A simple idea like Trivia Night, Guess the Song, or Team
              Challenge is enough to begin.</p>
          </article>
          <article className={styles.stepCard}>
            <span className={styles.stepNumber}>2</span>
            <h3>Plan the rules</h3>
            <p>Use Plan mode to decide rounds, scoring, player actions, and what should happen on the TV
              and phones.</p>
          </article>
          <article className={styles.stepCard}>
            <span className={styles.stepNumber}>3</span>
            <h3>Build both screens</h3>
            <p>Switch between TV and Phone targets, then use Build mode to ask Codex for visible changes.</p>
          </article>
          <article className={styles.stepCard}>
            <span className={styles.stepNumber}>4</span>
            <h3>Play together</h3>
            <p>Open the TV view on the shared screen and the Phone view for players. Keep the instructions
              updated as your game changes.</p>
          </article>
        </div>
      </section>

      <section className={styles.features}>
        <div className={styles.featuresGrid}>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>
              <MonitorSmartphone size={24} />
            </div>
            <h3 className={styles.featureTitle}>TV and Phone Views</h3>
            <p className={styles.featureDescription}>
              Design the shared TV screen and the player phone controls from the same project editor.
            </p>
          </div>
          
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>
              <Sparkles size={24} />
            </div>
            <h3 className={styles.featureTitle}>Plan Before You Build</h3>
            <p className={styles.featureDescription}>
              Ask Codex to help turn a loose idea into rules, rounds, scoring, and player flow before it changes files.
            </p>
          </div>
          
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>
              <Tv size={24} />
            </div>
            <h3 className={styles.featureTitle}>Ready to Host</h3>
            <p className={styles.featureDescription}>
              Open the TV display for the room, share the phone join link, and keep a simple rule sheet with each game.
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
