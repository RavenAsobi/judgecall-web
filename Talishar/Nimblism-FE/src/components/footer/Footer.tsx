import React from 'react';
import styles from './Footer.module.scss';

const Footer = () => (
  <footer className={styles.footer}>
    <p>
      Fan-made teaching project. Not affiliated with Legend Story Studios. Flesh
      and Blood™ cards and art belong to Legend Story Studios.
    </p>
    <a
      href="https://github.com/Talishar/Talishar"
      target="_blank"
      rel="noreferrer"
    >
      Based on Talishar · GPL-3.0
    </a>
  </footer>
);

export default Footer;
