const AuthUI = (() => {
  function renderAuthBox(container) {
    if (!SupabaseApp.isConfigured()) {
      container.innerHTML = `
        <div class="auth-box auth-box-muted">
          <span>Database not configured</span>
          <a class="button" href="../index.html#setup">Setup Supabase</a>
        </div>
      `;
      return;
    }

    const user = SupabaseApp.getUser();
    if (user) {
      container.innerHTML = `
        <div class="auth-box">
          <span class="auth-email">${user.email}</span>
          <button class="button" type="button" data-action="logout">Logout</button>
        </div>
      `;
      container.querySelector('[data-action="logout"]')?.addEventListener("click", async () => {
        await SupabaseApp.signOut();
      });
      return;
    }

    container.innerHTML = `
      <form class="auth-box auth-form" data-auth-form>
        <input class="search-input" type="email" name="email" placeholder="Email" required />
        <input class="search-input" type="password" name="password" placeholder="Password" required />
        <button class="button button-primary" type="submit" data-action="login">Login</button>
        <button class="button" type="button" data-action="signup">Sign Up</button>
        <span class="save-status" data-auth-status></span>
      </form>
    `;

    const form = container.querySelector("[data-auth-form]");
    const status = container.querySelector("[data-auth-status]");

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      try {
        status.textContent = "Signing in...";
        await SupabaseApp.signIn(formData.get("email"), formData.get("password"));
        status.textContent = "";
      } catch (error) {
        status.textContent = error.message;
        status.className = "save-status error";
      }
    });

    container.querySelector('[data-action="signup"]')?.addEventListener("click", async () => {
      const formData = new FormData(form);
      try {
        status.textContent = "Creating account...";
        await SupabaseApp.signUp(formData.get("email"), formData.get("password"));
        status.textContent = "Account created. Check email if confirmation is required, then login.";
        status.className = "save-status success";
      } catch (error) {
        status.textContent = error.message;
        status.className = "save-status error";
      }
    });
  }

  function bind(container, onChange) {
    renderAuthBox(container);
    return SupabaseApp.onAuthChange(() => {
      renderAuthBox(container);
      if (onChange) onChange(SupabaseApp.getUser());
    });
  }

  return { bind, renderAuthBox };
})();

window.AuthUI = AuthUI;
