const searchParams = new URLSearchParams(window.location.search);

document.getElementById('footer').textContent =
  `Version ${searchParams.get('version') ?? ''} · Copyright © ${searchParams.get('copyright') ?? ''}`;
