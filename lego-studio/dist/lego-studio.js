import { Lego as o } from "lego-dom";
o.define("lego-studio", `<style>self {
    display: block;
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 9999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
  .studio {
    display: grid;
    grid-template-columns: 280px 1fr 320px;
    height: 100vh;
    background: white;
  }

  /* Sidebar */
  .sidebar {
    background: white;
    border-right: 1px solid #e5e7eb;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .header {
    height: 57px;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1rem;
  }
  .branding {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    font-size: 1.125rem;
    color: #111827;
  }
  .branding h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
  }
  .version {
    font-size: 0.75rem;
    color: #9ca3af;
    background: #f3f4f6;
    padding: 2px 8px;
    border-radius: 4px;
  }
  .search-box {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #e5e7eb;
  }
  .search-input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 0.875rem;
    outline: none;
    transition: border-color 0.2s;
    box-sizing: border-box;
  }
  .search-input:focus { border-color: #2563eb; }
  .component-list {
    list-style: none;
    padding: 0 1rem;
    margin: 0;
    overflow-y: auto;
    flex: 1;
  }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    text-align: left;
    padding: 0.625rem 0.75rem;
    border: none;
    background: none;
    cursor: pointer;
    border-radius: 6px;
    color: #4b5563;
    font-size: 0.875rem;
    margin-bottom: 2px;
  }
  .nav-item:hover { background: #f3f4f6; color: #111827; }
  .nav-item.active { background: #eff6ff; color: #2563eb; font-weight: 500; }
  .icon { font-size: 1rem; opacity: 0.7; }

  /* Canvas */
  .canvas {
    background: #f3f4f6;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .toolbar {
    height: 57px;
    background: white;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1.5rem;
  }
  .breadcrumbs { font-size: 0.875rem; color: #6b7280; display: flex; gap: 0.5rem; }
  .crumb.active { color: #111827; font-weight: 500; }
  .toolbar button { 
    background: none; border: none; cursor: pointer; padding: 4px; border-radius: 4px;
    opacity: 0.6; transition: opacity 0.2s;
  }
  .toolbar button:hover { opacity: 1; background: #f3f4f6; }

  .stage-container {
    flex: 1;
    overflow: auto;
    padding: 2rem;
  }
  .stage-wrapper {
    min-height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .stage {
    background: white;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    padding: 2rem;
    min-width: 400px;
  }
  .empty-state {
    text-align: center;
    color: #9ca3af;
  }
  .empty-icon { font-size: 3rem; margin-bottom: 1rem; }

  /* Inspector */
  .inspector {
    background: white;
    border-left: 1px solid #e5e7eb;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .inspector-header {
    height: 57px;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1rem;
  }
  .inspector-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: #111827;
  }
  .live-indicator {
    font-size: 0.75rem;
    color: #10b981;
    background: #d1fae5;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 500;
  }
  .live-indicator.dirty { color: #f59e0b; background: #fef3c7; }
  .inspector-content {
    flex: 1;
    overflow: auto;
    padding: 1rem;
  }
  .json-editor-wrapper {
    background: #1e293b;
    border-radius: 6px;
    padding: 1rem;
    overflow: auto;
  }
  .json-editor {
    font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
    font-size: 0.875rem;
    color: #e2e8f0;
    outline: none;
    white-space: pre;
    min-height: 200px;
  }
  .error-banner {
    margin-top: 1rem;
    padding: 0.75rem;
    background: #fee2e2;
    color: #991b1b;
    border-radius: 6px;
    font-size: 0.875rem;
  }</style>
<div class="studio">
    <aside class="sidebar">
      <div class="header">
        <div class="branding">
           <svg width="24" height="24" viewBox="0 0 270 270" fill="none" style="margin-right: 8px;">
            <path d="M19.8 199H250.2C257.88 199 263 202.657 263 208.143V253.857C263 259.343 257.88 263 250.2 263H19.8C12.12 263 7.00001 259.343 7.00001 253.857V208.143C7.00001 202.657 12.12 199 19.8 199Z" fill="#FFCA28"/>
            <path d="M205.194 199H238.226V183C238.226 178.2 234.923 175 229.968 175H213.452C208.497 175 205.194 178.2 205.194 183V199Z" fill="#FFCA28"/>
            <path d="M147.387 199H180.419V183C180.419 178.2 177.116 175 172.161 175H155.645C150.69 175 147.387 178.2 147.387 183V199Z" fill="#FFCA28"/>
            <path d="M15.2581 143H106.097C111.052 143 114.355 146.2 114.355 151V191C114.355 195.8 111.052 199 106.097 199H15.2581C10.3032 199 7 195.8 7 191V151C7 146.2 10.3032 143 15.2581 143Z" fill="#FFCA28"/>
            <path d="M15.2581 87H106.097C111.052 87 114.355 90.2 114.355 95V135C114.355 139.8 111.052 143 106.097 143H15.2581C10.3032 143 7 139.8 7 135V95C7 90.2 10.3032 87 15.2581 87Z" fill="#FFCA28"/>
            <path d="M15.2581 31H106.097C111.052 31 114.355 34.2 114.355 39V79C114.355 83.8 111.052 87 106.097 87H15.2581C10.3032 87 7 83.8 7 79V39C7 34.2 10.3032 31 15.2581 31Z" fill="#FFCA28"/>
            <path d="M73.0645 31H106.097V15C106.097 10.2 102.794 7 97.8387 7H81.3226C76.3677 7 73.0645 10.2 73.0645 15V31Z" fill="#FFCA28"/>
            <path d="M15.2581 31H48.2903V15C48.2903 10.2 44.9871 7 40.0323 7H23.5161C18.5613 7 15.2581 10.2 15.2581 15V31Z" fill="#FFCA28"/>
            <path d="M256 208.143C256 207.853 255.974 207.612 255.411 207.21C254.671 206.682 253.019 206 250.2 206H19.7998C16.9807 206 15.3288 206.682 14.5889 207.21C14.0263 207.612 14 207.853 14 208.143V253.857C14 254.147 14.0263 254.388 14.5889 254.79C15.3288 255.318 16.9807 256 19.7998 256H250.2C253.019 256 254.671 255.318 255.411 254.79C255.974 254.388 256 254.147 256 253.857V208.143ZM173.419 183C173.419 182.606 173.352 182.39 173.319 182.308C173.302 182.265 173.29 182.243 173.285 182.236C173.281 182.23 173.278 182.228 173.277 182.228C173.275 182.226 173.266 182.217 173.244 182.203C173.22 182.188 173.174 182.163 173.098 182.135C172.946 182.078 172.647 182 172.161 182H155.646C155.16 182 154.861 182.078 154.709 182.135C154.632 182.163 154.585 182.188 154.562 182.203C154.538 182.218 154.529 182.227 154.528 182.228C154.527 182.228 154.526 182.23 154.521 182.236C154.517 182.243 154.504 182.264 154.486 182.308C154.453 182.39 154.387 182.606 154.387 183V192H173.419V183ZM231.226 183C231.226 182.606 231.159 182.39 231.126 182.308C231.109 182.264 231.095 182.243 231.091 182.236C231.087 182.23 231.085 182.228 231.084 182.228C231.082 182.226 231.073 182.217 231.051 182.203C231.027 182.188 230.981 182.163 230.904 182.135C230.752 182.078 230.453 182 229.968 182H213.451C212.966 182 212.666 182.078 212.515 182.135C212.438 182.163 212.392 182.188 212.368 182.203C212.345 182.218 212.336 182.227 212.335 182.228C212.334 182.228 212.332 182.23 212.328 182.236C212.324 182.243 212.31 182.264 212.293 182.308C212.26 182.39 212.193 182.606 212.193 183V192H231.226V183ZM107.354 151C107.354 150.606 107.288 150.39 107.255 150.308C107.238 150.264 107.224 150.243 107.22 150.236C107.216 150.23 107.214 150.228 107.213 150.228C107.211 150.226 107.202 150.217 107.18 150.203C107.156 150.188 107.109 150.163 107.033 150.135C106.881 150.078 106.582 150 106.097 150H15.2578C14.7724 150 14.4731 150.078 14.3213 150.135C14.2449 150.163 14.1986 150.188 14.1748 150.203C14.1521 150.217 14.143 150.226 14.1416 150.228C14.1408 150.228 14.139 150.23 14.1348 150.236C14.1304 150.243 14.1168 150.264 14.0996 150.308C14.0667 150.39 14 150.606 14 151V191C14 191.394 14.0667 191.61 14.0996 191.692C14.1168 191.736 14.1304 191.757 14.1348 191.764C14.139 191.77 14.1408 191.772 14.1416 191.772C14.143 191.774 14.1521 191.783 14.1748 191.797C14.1986 191.812 14.2449 191.837 14.3213 191.865C14.4731 191.922 14.7724 192 15.2578 192H106.097C106.582 192 106.881 191.922 107.033 191.865C107.109 191.837 107.156 191.812 107.18 191.797C107.202 191.783 107.211 191.774 107.213 191.772C107.214 191.772 107.216 191.77 107.22 191.764C107.224 191.757 107.238 191.736 107.255 191.692C107.288 191.61 107.354 191.394 107.354 191V151ZM107.354 95C107.354 94.6058 107.288 94.3904 107.255 94.3076C107.238 94.2644 107.224 94.2429 107.22 94.2363C107.216 94.2302 107.214 94.2283 107.213 94.2275C107.211 94.2257 107.202 94.2168 107.18 94.2031C107.156 94.1883 107.109 94.1632 107.033 94.1348C106.881 94.0782 106.582 94 106.097 94H15.2578C14.7724 94 14.4731 94.0782 14.3213 94.1348C14.2449 94.1632 14.1986 94.1883 14.1748 94.2031C14.1521 94.2173 14.143 94.2262 14.1416 94.2275C14.1408 94.2284 14.139 94.2301 14.1348 94.2363C14.1304 94.2429 14.1168 94.2643 14.0996 94.3076C14.0667 94.3904 14 94.6058 14 95V135C14 135.394 14.0667 135.61 14.0996 135.692C14.1168 135.736 14.1304 135.757 14.1348 135.764C14.139 135.77 14.1408 135.772 14.1416 135.772C14.143 135.774 14.1521 135.783 14.1748 135.797C14.1986 135.812 14.2449 135.837 14.3213 135.865C14.4731 135.922 14.7724 136 15.2578 136H106.097C106.582 136 106.881 135.922 107.033 135.865C107.109 135.837 107.156 135.812 107.18 135.797C107.202 135.783 107.211 135.774 107.213 135.772C107.214 135.772 107.216 135.77 107.22 135.764C107.224 135.757 107.238 135.736 107.255 135.692C107.288 135.61 107.354 135.394 107.354 135V95ZM107.354 39C107.354 38.6058 107.288 38.3904 107.255 38.3076C107.238 38.2644 107.224 38.2429 107.22 38.2363C107.216 38.2302 107.214 38.2283 107.213 38.2275C107.211 38.2257 107.202 38.2168 107.18 38.2031C107.156 38.1883 107.109 38.1632 107.033 38.1348C106.881 38.0782 106.582 38 106.097 38H15.2578C14.7724 38 14.4731 38.0782 14.3213 38.1348C14.2449 38.1632 14.1986 38.1883 14.1748 38.2031C14.1521 38.2173 14.143 38.2262 14.1416 38.2275C14.1408 38.2284 14.139 38.2301 14.1348 38.2363C14.1304 38.2429 14.1168 38.2643 14.0996 38.3076C14.0667 38.3904 14 38.6058 14 39V79C14 79.3942 14.0667 79.6096 14.0996 79.6924C14.1168 79.7357 14.1304 79.7571 14.1348 79.7637C14.139 79.7699 14.1408 79.7716 14.1416 79.7725C14.143 79.7738 14.1521 79.7827 14.1748 79.7969C14.1986 79.8117 14.2449 79.8368 14.3213 79.8652C14.4731 79.9218 14.7724 80 15.2578 80H106.097C106.582 80 106.881 79.9218 107.033 79.8652C107.109 79.8368 107.156 79.8117 107.18 79.7969C107.202 79.7832 107.211 79.7743 107.213 79.7725C107.214 79.7717 107.216 79.7698 107.22 79.7637C107.224 79.7571 107.238 79.7356 107.255 79.6924C107.288 79.6096 107.354 79.3942 107.354 79V39ZM41.29 15C41.29 14.6058 41.2233 14.3904 41.1904 14.3076C41.1732 14.2644 41.1596 14.2429 41.1553 14.2363C41.1511 14.2302 41.1493 14.2283 41.1484 14.2275C41.1466 14.2258 41.1372 14.2169 41.1152 14.2031C41.0914 14.1883 41.045 14.1632 40.9688 14.1348C40.8169 14.0782 40.5178 14 40.0322 14H23.5166C23.031 14 22.7309 14.0782 22.5791 14.1348C22.5027 14.1633 22.4563 14.1883 22.4326 14.2031C22.4092 14.2177 22.4004 14.2266 22.3994 14.2275C22.3986 14.2284 22.3968 14.23 22.3926 14.2363C22.3882 14.2429 22.3747 14.2643 22.3574 14.3076C22.3245 14.3904 22.2578 14.6058 22.2578 15V24H41.29V15ZM99.0967 15C99.0967 14.6058 99.03 14.3904 98.9971 14.3076C98.9799 14.2644 98.9663 14.2429 98.9619 14.2363C98.9577 14.2301 98.9559 14.2283 98.9551 14.2275C98.9535 14.2261 98.9443 14.2171 98.9219 14.2031C98.8981 14.1883 98.8517 14.1632 98.7754 14.1348C98.6236 14.0782 98.3244 14 97.8389 14H81.3223C80.8369 14 80.5375 14.0782 80.3857 14.1348C80.3094 14.1632 80.263 14.1883 80.2393 14.2031C80.2164 14.2174 80.2073 14.2263 80.2061 14.2275C80.2052 14.2284 80.2034 14.23 80.1992 14.2363C80.1948 14.2429 80.1813 14.2643 80.1641 14.3076C80.1312 14.3904 80.0645 14.6058 80.0645 15V24H99.0967V15ZM113.097 25.5107C114.495 26.1706 115.799 27.0527 116.954 28.1719C119.921 31.0462 121.354 34.9412 121.354 39V79C121.354 81.8462 120.648 84.6105 119.204 87C120.648 89.3895 121.354 92.1538 121.354 95V135C121.354 137.846 120.648 140.611 119.204 143C120.648 145.389 121.354 148.154 121.354 151V191C121.354 191.335 121.345 191.668 121.325 192H140.387V183C140.387 178.941 141.82 175.046 144.787 172.172C147.734 169.317 151.643 168 155.646 168H172.161C176.164 168 180.071 169.317 183.019 172.172C185.986 175.046 187.419 178.941 187.419 183V192H198.193V183C198.193 178.941 199.627 175.046 202.594 172.172C205.541 169.317 209.449 168 213.451 168H229.968C233.97 168 237.878 169.317 240.825 172.172C243.792 175.046 245.226 178.941 245.226 183V192H250.2C255.06 192 259.809 193.147 263.549 195.818C267.466 198.616 270 202.947 270 208.143V253.857C270 259.053 267.466 263.384 263.549 266.182C259.809 268.853 255.06 270 250.2 270H19.7998C14.9396 270 10.1913 268.853 6.45117 266.182C2.53412 263.384 8.92991e-05 259.053 0 253.857V208.143C5.4865e-05 204.95 0.95743 202.085 2.60352 199.701C0.853644 197.16 0 194.129 0 191V151C0 148.154 0.706222 145.389 2.15039 143C0.706222 140.611 0 137.846 0 135V95C0 92.1539 0.706222 89.3894 2.15039 87C0.706222 84.6106 0 81.8461 0 79V39C0 34.9412 1.43333 31.0462 4.40039 28.1719C5.55577 27.0526 6.85931 26.1706 8.25781 25.5107V15C8.25781 10.9412 9.69114 7.04622 12.6582 4.17188C15.6053 1.31691 19.5139 0 23.5166 0H40.0322C44.0348 0 47.9426 1.3171 50.8896 4.17188C53.8567 7.04622 55.29 10.9412 55.29 15V24H66.0645V15C66.0645 10.9412 67.4978 7.04622 70.4648 4.17188C73.4119 1.31705 77.3197 6.86267e-05 81.3223 0H97.8389C101.841 3.51509e-05 105.749 1.31707 108.696 4.17188C111.663 7.04622 113.097 10.9412 113.097 15V25.5107Z" fill="#3E3E3E"/>
          </svg>
          <h3>Lego Studio</h3>
        </div>
        <span class="version">v1.0</span>
      </div>
      <div class="search-box">
        <input 
          b-sync="search" 
          placeholder="Filter components..." 
          class="search-input"
          @input="filterComponents()">
      </div>
      <div class="component-list">
        <div b-for="name in filtered" class="nav-wrapper">
          <button @click="select(name)" class="nav-item [[ active === name ? 'active' : '' ]]">
            <span class="icon">📦</span>
            [[ name ]]
          </button>
        </div>
      </div>
    </aside>

    <main class="canvas">
      <div class="toolbar">
        <div class="breadcrumbs">
          <span class="crumb">App</span>
          <span class="separator">/</span>
          <span class="crumb active">[[ active || 'Select a component' ]]</span>
        </div>
        <div class="actions">
          <button @click="refresh()" title="Reload Component">🔄</button>
        </div>
      </div>
      <div class="stage-container">
        <div class="stage-wrapper">
          <div class="stage" b-show="active">
            <!-- Dynamic Mount Point -->
            <div id="mount-point"></div>
          </div>
          <div class="empty-state" b-show="!active">
            <div class="empty-icon">👈</div>
            <p>Select a component to inspect</p>
          </div>
        </div>
      </div>
    </main>

    <aside class="inspector">
      <div class="inspector-header">
        <h3>Inspector</h3>
        <span class="live-indicator [[ isDirty ? 'dirty' : '' ]]">
          [[ isDirty ? 'Unsaved' : 'Live' ]]
        </span>
      </div>
      
      <div class="inspector-content">
        <div class="json-editor-wrapper">
          <pre><code 
            b-var="editor"
            contenteditable="true" 
            class="json-editor"
            @input="onEditorInput()"
            @keydown="handleKeydown(event)"></code></pre>
        </div>
        <div class="inspector-actions" b-if="error">
          <div class="error-banner">[[ error ]]</div>
        </div>
      </div>
    </aside>
  </div>`, {
  components: [],
  filtered: [],
  search: "",
  active: null,
  activeInstance: null,
  isDirty: !1,
  error: null,
  async mounted() {
    this.components = o.getLegos().filter((e) => e !== "lego-studio"), this.filtered = [...this.components], this.$route.params && this.$route.params.component && this.select(this.$route.params.component, !1);
  },
  filterComponents() {
    const e = this.search.toLowerCase();
    this.filtered = this.components.filter(
      (t) => t.toLowerCase().includes(e)
    );
  },
  select(e, t = !0) {
    this.active = e, t && this.$go("/_/studio/" + e).get(), this.renderComponent();
  },
  renderComponent() {
    this.active && setTimeout(() => {
      const e = this.$element.shadowRoot.getElementById("mount-point");
      if (e) {
        this.activeInstance && o.unsnap(this.activeInstance), e.innerHTML = "";
        try {
          const t = document.createElement(this.active);
          e.appendChild(t), o.snap(t), this.activeInstance = t;
        } catch (t) {
          this.error = `Failed to render component: ${t.message}`;
        }
        this.syncInspector();
      }
    }, 10);
  },
  syncInspector() {
    var n;
    if (!((n = this.activeInstance) != null && n.state)) return;
    const e = this.activeInstance.state, t = Object.keys(e).filter((i) => !i.startsWith("$") && typeof e[i] != "function").reduce((i, r) => ({ ...i, [r]: e[r] }), {});
    this.$vars.editor && (this.$vars.editor.textContent = JSON.stringify(t, null, 2)), this.isDirty = !1;
  },
  onEditorInput() {
    var e;
    this.isDirty = !0, this.error = null;
    try {
      const t = JSON.parse(this.$vars.editor.textContent);
      (e = this.activeInstance) != null && e.state && (this.activeInstance.state = t), this.isDirty = !1;
    } catch (t) {
      this.error = t.message;
    }
  },
  handleKeydown(e) {
    e.key === "Tab" && (e.preventDefault(), document.execCommand("insertText", !1, "  "));
  },
  refresh() {
    this.active && this.renderComponent();
  }
}, "");
const a = "lego-studio";
export {
  a as default
};
