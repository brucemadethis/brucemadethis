const headerHoverStyles = document.createElement('link');
headerHoverStyles.rel = 'stylesheet';
headerHoverStyles.href = new URL('./header-hover.css', import.meta.url);
document.head.append(headerHoverStyles);

const menuToggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav-links');

if (nav && !nav.querySelector('a[href="auth.html"]')) {
  const accountLink = document.createElement('a');
  accountLink.href = 'auth.html';
  accountLink.textContent = 'Account';
  nav.insertBefore(accountLink, nav.querySelector('.nav-cta'));
}

document.querySelectorAll('a[href="contact.html"]').forEach((link) => {
  link.href = 'contact.html#project-form';
});

document.querySelectorAll('.project-grid').forEach((grid) => {
  const moninCard = document.createElement('article');
  moninCard.className = 'project-card project-offset reveal delay-one';
  moninCard.innerHTML = `
    <div class="project-image project-image-monin">
      <img class="monin-logo" src="https://monin1912.com/cdn/shop/files/LOGO_MONIN_ONE-COLOR_versions_RGB_OK_Brown_903065d2-8711-417f-98ce-ba7ea89964f0.png?v=1775727115&width=352" alt="MONIN logo" />
      <span class="project-number">04</span>
    </div>
    <div class="project-meta">
      <div><h3>MONIN Kenya</h3><p>Website management · IT support · Digital operations</p></div>
      <a href="https://moninkenya.com/?srsltid=AU7gw4VvaBO7in4yJWsY0RKf9FqPEYoVA4Q-hGk83al5W459otiKDZgx" target="_blank" rel="noopener noreferrer" aria-label="Visit MONIN Kenya website">↗</a>
    </div>
  `;
  grid.append(moninCard);
});

document.querySelectorAll('.project-grid').forEach((grid) => {
  const izziCard = [...grid.querySelectorAll('.project-card')].find((card) => (
    card.querySelector('.project-number')?.textContent.trim() === '01'
  ));
  if (!izziCard) return;

  const image = izziCard.querySelector('.project-image');
  const imageElement = izziCard.querySelector('.project-image img');
  const title = izziCard.querySelector('.project-meta h3');
  const description = izziCard.querySelector('.project-meta p');
  const link = izziCard.querySelector('.project-meta a');

  image?.classList.add('project-image-izzi');
  if (imageElement) {
    imageElement.src = './izzi.png';
    imageElement.alt = 'Izzi Brunch & Cake logo';
  }
  if (title) title.textContent = 'Izzi Brunch & Cake';
  if (description) description.textContent = 'Restaurant · Brunch · Cake';
  if (link) {
    link.href = 'https://izzibrunchandcake.com/';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', 'Visit Izzi Brunch & Cake website');
  }

  if (grid.closest('.page-work')) {
    grid.querySelectorAll('.project-card').forEach((card) => {
      const number = card.querySelector('.project-number')?.textContent.trim();
      if (number === '03') card.remove();
      else card.classList.remove('project-feature', 'project-offset');
    });
  }
});

document.querySelectorAll('.project-card').forEach((card) => {
  const projectNumber = card.querySelector('.project-number');
  const projectLink = card.querySelector('.project-meta a');
  const projectTitle = card.querySelector('.project-meta h3');
  const projectDescription = card.querySelector('.project-meta p');
  const projectImage = card.querySelector('.project-image');
  const projectImageElement = card.querySelector('.project-image img');
  if (projectNumber?.textContent.trim() !== '02' || !projectLink) return;
  if (projectTitle) projectTitle.textContent = 'MarkMadeThisWork';
  if (projectDescription) projectDescription.textContent = 'Brand identity · Logos · Multimedia design';
  if (projectImage) projectImage.classList.add('project-image-mark');
  if (projectImageElement) {
    projectImageElement.src = 'https://markmadethiswork.com/profile/mark.jpg';
    projectImageElement.alt = 'Mark Made This profile image';
  }
  projectLink.href = 'https://markmadethiswork.com/#top';
  projectLink.target = '_blank';
  projectLink.rel = 'noopener noreferrer';
  projectLink.setAttribute('aria-label', 'Visit MarkMadeThis website');
});

document.querySelectorAll('a[href^="mailto:"]').forEach((link) => {
  const mailtoUrl = new URL(link.href);
  const gmailUrl = new URL('https://mail.google.com/mail/');
  gmailUrl.searchParams.set('view', 'cm');
  gmailUrl.searchParams.set('fs', '1');
  gmailUrl.searchParams.set('to', 'brucearambe@gmail.com');

  const subject = mailtoUrl.searchParams.get('subject');
  if (subject) gmailUrl.searchParams.set('su', subject);

  link.href = gmailUrl.toString();
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
});

const contactDetails = document.querySelector('.contact-details');
if (contactDetails) {
  const contactCta = document.querySelector('.contact-page .button');
  if (contactCta) {
    contactCta.href = '#project-form';
    contactCta.innerHTML = 'Tell me about your project <span>↓</span>';
  }

  const contactForm = document.createElement('form');
  contactForm.className = 'contact-form reveal';
  contactForm.id = 'project-form';
  contactForm.innerHTML = `
    <div class="contact-form-heading">
      <p class="eyebrow">Get in touch</p>
      <h2>Tell me what<br /><em>you are building.</em></h2>
    </div>
    <label for="contact-name">Your name</label>
    <input id="contact-name" name="name" type="text" autocomplete="name" required />
    <label for="contact-email">Email address</label>
    <input id="contact-email" name="email" type="email" autocomplete="email" required />
    <label for="contact-company">Company or project</label>
    <input id="contact-company" name="company" type="text" autocomplete="organization" />
    <label for="contact-type">What kind of website do you need?</label>
    <select id="contact-type" name="project type" required>
      <option value="" selected disabled>Select a project type</option>
      <option>Business or services website</option>
      <option>Portfolio or personal brand</option>
      <option>E-commerce store</option>
      <option>Campaign or landing page</option>
      <option>Web app or digital product</option>
      <option>Website redesign</option>
      <option>Not sure yet</option>
    </select>
    <label for="contact-goal">What should the website help you achieve?</label>
    <textarea id="contact-goal" name="goal" rows="3" placeholder="For example: get more enquiries, launch a new brand, or sell online." required></textarea>
    <label for="contact-features">Anything you know you’ll need?</label>
    <textarea id="contact-features" name="features" rows="3" placeholder="Bookings, payments, a blog, forms, integrations, or anything else."></textarea>
    <div class="form-row">
      <div><label for="contact-timeline">Ideal timeline</label><select id="contact-timeline" name="timeline"><option>As soon as possible</option><option>Within 1 month</option><option>1–3 months</option><option>3+ months</option><option>Flexible</option></select></div>
      <div><label for="contact-budget">Working budget</label><select id="contact-budget" name="budget"><option>Not sure yet</option><option>Under KSh 100,000</option><option>KSh 100,000–250,000</option><option>KSh 250,000–500,000</option><option>Over KSh 500,000</option></select></div>
    </div>
    <button class="button button-lime" type="submit">Send enquiry <span>↗</span></button>
  `;
  contactDetails.prepend(contactForm);

  contactForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(contactForm);
    const gmailUrl = new URL('https://mail.google.com/mail/');
    gmailUrl.searchParams.set('view', 'cm');
    gmailUrl.searchParams.set('fs', '1');
    gmailUrl.searchParams.set('to', 'brucearambe@gmail.com');
    gmailUrl.searchParams.set('su', `Website enquiry from ${formData.get('name')}`);
    gmailUrl.searchParams.set('body', [
      `Name: ${formData.get('name')}`,
      `Email: ${formData.get('email')}`,
      `Company or project: ${formData.get('company') || 'Not provided'}`,
      `Project type: ${formData.get('project type')}`,
      `Ideal timeline: ${formData.get('timeline')}`,
      `Working budget: ${formData.get('budget')}`,
      '',
      `Main goal:\n${formData.get('goal')}`,
      '',
      `Features or requirements:\n${formData.get('features') || 'Not provided'}`,
      '',
    ].join('\n'));
    window.open(gmailUrl.toString(), '_blank', 'noopener,noreferrer');
  });
}

const contactFormStyles = document.createElement('style');
contactFormStyles.textContent = `
  .contact-details { grid-template-columns: minmax(0, 1.25fr) minmax(220px, .75fr); }
  .contact-form { grid-row: span 2; padding: 44px; background: #2d2d27; color: var(--paper); }
  .contact-form-heading { margin-bottom: 34px; }
  .contact-form-heading .eyebrow { color: var(--lime); margin-bottom: 16px; }
  .contact-form h2 { font: 700 clamp(2.5rem, 4vw, 4.5rem)/.95 var(--display); letter-spacing: -.065em; margin: 0; }
  .contact-form h2 em { color: var(--coral); font-style: normal; }
  .contact-form label { display: block; margin: 20px 0 7px; color: #c6c5bb; font-size: 13px; font-weight: 700; }
  .contact-form input, .contact-form select, .contact-form textarea { display: block; width: 100%; border: 1px solid #5d5d53; border-radius: 0; padding: 12px 13px; background: transparent; color: var(--paper); font: 16px var(--body); }
  .contact-form option { color: var(--ink); }
  .contact-form input:focus, .contact-form select:focus, .contact-form textarea:focus { outline: 2px solid var(--lime); outline-offset: 2px; }
  .contact-form textarea { resize: vertical; min-height: 120px; }
  .contact-form .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .project-image-monin { display: grid; place-items: center; background: #f1e8d8; }
  .project-image-monin .monin-logo { width: min(58%, 260px); height: auto; object-fit: contain; filter: none; }
  .project-image-monin .project-number { color: #6e3f2c; }
  .project-image-mark { display: grid; place-items: center; background: #f1eee7; }
  .project-image-mark img { width: 100%; height: 100%; object-fit: cover; filter: none; }
  .contact-form .button { margin-top: 28px; border: 0; cursor: pointer; font: 700 14px var(--body); }
  @media (max-width: 800px) { .contact-details { display: block; } .contact-form { margin-bottom: 55px; padding: 28px 22px; } .contact-form .form-row { grid-template-columns: 1fr; gap: 0; } }
`;
document.head.append(contactFormStyles);

const favicon = document.createElement('link');
favicon.rel = 'icon';
favicon.type = 'image/svg+xml';
favicon.href = './favicon.svg';
document.head.append(favicon);

const whatsappLink = document.createElement('a');
whatsappLink.className = 'whatsapp-float';
whatsappLink.href = 'https://wa.me/254708190253?text=Hi%20Bruce%2C%20I%27d%20like%20to%20talk%20about%20a%20website%20project.';
whatsappLink.target = '_blank';
whatsappLink.rel = 'noopener noreferrer';
whatsappLink.setAttribute('aria-label', 'Contact BruceMadeThis on WhatsApp');
whatsappLink.innerHTML = '<span aria-hidden="true">✆</span><span>WhatsApp Bruce</span>';
document.body.append(whatsappLink);

const savedTheme = localStorage.getItem('brucemadethis-theme');
const preferredTheme = savedTheme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
document.documentElement.dataset.theme = preferredTheme;

const themeToggle = document.createElement('button');
themeToggle.className = 'theme-toggle';
themeToggle.type = 'button';
themeToggle.setAttribute('aria-label', preferredTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
themeToggle.innerHTML = '<span class="moon-icon" aria-hidden="true">☾</span><span class="sun-icon" aria-hidden="true">☀</span>';
menuToggle?.parentNode.insertBefore(themeToggle, menuToggle);

themeToggle.addEventListener('click', () => {
  const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = nextTheme;
  localStorage.setItem('brucemadethis-theme', nextTheme);
  themeToggle.setAttribute('aria-label', nextTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
});

const pageStyles = document.createElement('link');
pageStyles.rel = 'stylesheet';
pageStyles.href = './pages.css';
document.head.append(pageStyles);

const themeStyles = document.createElement('link');
themeStyles.rel = 'stylesheet';
themeStyles.href = './theme.css';
document.head.append(themeStyles);

menuToggle?.addEventListener('click', () => {
  const isOpen = nav.classList.toggle('open');
  menuToggle.classList.toggle('open', isOpen);
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});

document.querySelectorAll('.nav-links a').forEach((link) => {
  link.addEventListener('click', () => {
    nav.classList.remove('open');
    menuToggle?.classList.remove('open');
    menuToggle?.setAttribute('aria-expanded', 'false');
  });
});

const revealObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal').forEach((element) => revealObserver.observe(element));

const authForm = document.querySelector('#auth-form');
const authCard = document.querySelector('.auth-card');
if (authForm && authCard) {
  const configuredApi = document.querySelector('meta[name="bmt-api-base"]')?.content.trim();
  const isLocalFrontend = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const authApi = window.BMT_API_BASE || configuredApi || (isLocalFrontend ? 'http://localhost:8787' : window.location.origin);
  const authTabs = [...document.querySelectorAll('[data-auth-mode]')];
  const nameField = document.querySelector('.auth-name-field');
  const nameInput = document.querySelector('#auth-name');
  const authTitle = document.querySelector('#auth-title');
  const submitLabel = document.querySelector('.auth-submit-label');
  const authMessage = document.querySelector('#auth-message');
  const resendVerificationButton = document.querySelector('.auth-resend');
  const signedInPanel = document.querySelector('.auth-signed-in');
  let authMode = 'login';

  const showMessage = (message, isError = false) => {
    authMessage.textContent = message;
    authMessage.classList.toggle('is-error', isError);
  };

  const setMode = (mode) => {
    authMode = mode;
    const isSignup = mode === 'signup';
    nameField.hidden = !isSignup;
    nameInput.required = isSignup;
    document.querySelector('#auth-password').autocomplete = isSignup ? 'new-password' : 'current-password';
    authTitle.textContent = isSignup ? 'Create your account.' : 'Sign in to your account.';
    submitLabel.textContent = isSignup ? 'Create account' : 'Sign in';
    authTabs.forEach((tab) => {
      const active = tab.dataset.authMode === mode;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    showMessage('');
    resendVerificationButton.hidden = true;
  };

  const showSignedIn = (user) => {
    authForm.hidden = true;
    signedInPanel.hidden = false;
    document.querySelector('.auth-user-name').textContent = user.user_metadata?.full_name || user.email.split('@')[0];
  };

  const verificationResult = new URLSearchParams(window.location.search).get('verified');
  if (verificationResult === '1') {
    showMessage('Your email is verified. You can sign in now.');
  } else if (verificationResult === '0') {
    showMessage('That verification link is invalid or expired. Request a new link and try again.', true);
    resendVerificationButton.hidden = false;
  }

  authTabs.forEach((tab) => tab.addEventListener('click', () => setMode(tab.dataset.authMode)));
  authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    showMessage('');
    const body = Object.fromEntries(new FormData(authForm));
    try {
      const response = await fetch(`${authApi}/api/auth/${authMode}`, { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) return showMessage(result.error || 'Something went wrong. Please try again.', true);
      if (result.requiresEmailConfirmation) {
        resendVerificationButton.hidden = false;
        return showMessage(result.message);
      }
      showSignedIn(result.user);
    } catch {
      showMessage('The account service is unavailable right now. Please try again shortly.', true);
    }
  });

  resendVerificationButton.addEventListener('click', async () => {
    const email = document.querySelector('#auth-email').value.trim();
    if (!email) return showMessage('Enter your email address first.', true);
    resendVerificationButton.disabled = true;
    try {
      const response = await fetch(`${authApi}/api/auth/resend-verification`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email })
      });
      const result = await response.json();
      if (!response.ok) return showMessage(result.error || 'Unable to resend the verification email. Please try again.', true);
      showMessage(result.message);
    } catch {
      showMessage('The account service is unavailable right now. Please try again shortly.', true);
    } finally {
      resendVerificationButton.disabled = false;
    }
  });

  document.querySelector('.auth-logout').addEventListener('click', async () => {
    try {
      const response = await fetch(`${authApi}/api/auth/logout`, { method: 'POST', credentials: 'include' });
      if (!response.ok) throw new Error('Sign out failed.');
      authForm.hidden = false;
      signedInPanel.hidden = true;
      authForm.reset();
      setMode('login');
    } catch {
      showMessage('Unable to sign out right now. Please try again.', true);
    }
  });

  fetch(`${authApi}/api/auth/me`, { credentials: 'include' })
    .then((response) => response.ok ? response.json() : null)
    .then((result) => result?.user && showSignedIn(result.user))
    .catch(() => {});
}
