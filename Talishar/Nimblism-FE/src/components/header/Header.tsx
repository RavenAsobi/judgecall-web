import React from 'react';
import { Link, Outlet } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Footer from 'components/footer/Footer';
import SessionRecovery from 'components/SessionRecovery';
import styles from './Header.module.scss';

const Header = () => (
  <div className={styles.shell}>
    <Toaster
      position="top-center"
      toastOptions={{
        style: {
          background: '#0a1d22',
          color: '#f5f8f8',
          border: '1px solid #1c3b40'
        }
      }}
    />

    <header className={styles.header}>
      <Link to="/" className={styles.brand} aria-label="Nimblism home">
        <img src="/images/nimblism-mark.png" alt="" />
        <span>NIMBLISM</span>
      </Link>
      <nav aria-label="Legal navigation">
        <a
          href="https://github.com/Talishar/Talishar/blob/main/LICENSE"
          target="_blank"
          rel="noreferrer"
        >
          GPL / About
        </a>
      </nav>
    </header>

    <div className={styles.content}>
      <Outlet />
    </div>
    <Footer />
    <SessionRecovery />
  </div>
);

export default Header;
