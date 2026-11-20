/* =========================================================
   Good Bites - shared data layer (used by login, index, admin, shop)

   One place, one config. Data is kept in localStorage (this device)
   and, when Supabase is configured below, ALSO in the cloud table
   gb_kv, so every phone / PC sees the same shops and receipts live.

   - No Supabase keys  -> works, but only inside ONE browser
                          (tabs of the same browser stay in sync).
   - With Supabase keys -> admin changes appear on every team device.
   ========================================================= */
(function () {
    "use strict";

    var CONFIG = {
        SUPABASE_URL: "",   // e.g. https://abcdxyz.supabase.co
        SUPABASE_KEY: "",   // the anon / publishable key
        TABLE: "gb_kv",
        POLL_MS: 15000
    };

    var SHOPS_KEY = "businessManagerDemoShops";
    var RCP_PREFIX = "businessManagerReceipts_";
    var OWN_KEYS = /^businessManager(DemoShops|Receipts_)/;

    var watchers = [];
    var started = false;
    var GB = {
        config: CONFIG,
        SHOPS_KEY: SHOPS_KEY,
        RCP_PREFIX: RCP_PREFIX,
        sb: null,
        onStatus: null
    };

    function status(s) { if (typeof GB.onStatus === "function") GB.onStatus(s); }

    function parse(raw) {
        if (raw == null) return null;
        if (typeof raw !== "string") return raw;
        try { return JSON.parse(raw); } catch (e) { return null; }
    }

    GB.init = function () {
        if (GB.sb || !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_KEY) return;
        if (!window.supabase || !window.supabase.createClient) return;
        GB.sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
            realtime: { params: { eventsPerSecond: 5 } }
        });
    };

    GB.readLocal = function (key) {
        try { return parse(localStorage.getItem(key)); } catch (e) { return null; }
    };

    GB.writeLocal = function (key, value) {
        try {
            if (value === null || value === undefined) localStorage.removeItem(key);
            else localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) { return false; }
    };

    function dispatch(key, value) {
        watchers.forEach(function (w) {
            if (w.match(key)) { try { w.cb(key, value); } catch (e) { console.error(e); } }
        });
    }

    GB.get = async function (key) {
        if (GB.sb) {
            try {
                var r = await GB.sb.from(CONFIG.TABLE).select("value").eq("key", key).maybeSingle();
                if (r.error) throw r.error;
                if (r.data && r.data.value != null) {
                    var v = parse(r.data.value);
                    if (v !== null) { GB.writeLocal(key, v); return v; }
                }
            } catch (e) { console.warn("Cloud read failed, using this device's copy:", e); }
        }
        return GB.readLocal(key);
    };

    GB.set = async function (key, value) {
        if (!GB.writeLocal(key, value)) throw new Error("Browser storage is full. Try a smaller image.");
        if (GB.sb) {
            var r = await GB.sb.from(CONFIG.TABLE)
                .upsert({ key: key, value: JSON.stringify(value) });
            if (r.error) throw r.error;
        }
    };

    GB.remove = async function (key) {
        GB.writeLocal(key, null);
        if (GB.sb) {
            var r = await GB.sb.from(CONFIG.TABLE).delete().eq("key", key);
            if (r.error) throw r.error;
        }
    };

    /* Download every row once; update this device's copy; tell watchers what changed */
    GB.pullAll = async function () {
        if (!GB.sb) return false;
        try {
            var r = await GB.sb.from(CONFIG.TABLE).select("key,value");
            if (r.error) throw r.error;
            (r.data || []).forEach(function (row) {
                if (!OWN_KEYS.test(row.key)) return;
                var v = parse(row.value);
                if (v === null) return;
                var same = false;
                try { same = localStorage.getItem(row.key) === JSON.stringify(v); } catch (e) {}
                if (!same) { GB.writeLocal(row.key, v); dispatch(row.key, v); }
            });
            return true;
        } catch (e) { console.warn("Cloud sync failed:", e); return false; }
    };

    /* Admin only: send data that exists on this device but not yet in the cloud */
    GB.syncUp = async function () {
        if (!GB.sb) return;
        try {
            var r = await GB.sb.from(CONFIG.TABLE).select("key");
            if (r.error) throw r.error;
            var have = {};
            (r.data || []).forEach(function (row) { have[row.key] = true; });
            var rows = [];
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                if (OWN_KEYS.test(k) && !have[k]) {
                    var v = GB.readLocal(k);
                    if (v !== null) rows.push({ key: k, value: JSON.stringify(v) });
                }
            }
            if (rows.length) await GB.sb.from(CONFIG.TABLE).upsert(rows);
        } catch (e) { console.warn("Upload of existing data failed:", e); }
    };

    /* Be told whenever a matching key changes: other tab, other device, cloud */
    GB.watch = function (match, cb) {
        watchers.push({ match: match, cb: cb });
        if (started) return;
        started = true;

        window.addEventListener("storage", function (e) {
            if (!e.key || !OWN_KEYS.test(e.key)) return;
            dispatch(e.key, parse(e.newValue));
        });

        if (!GB.sb) { status("off"); return; }

        status("wait");
        GB.sb.channel("gb-all")
            .on("postgres_changes", { event: "*", schema: "public", table: CONFIG.TABLE }, function (p) {
                var row = p.eventType === "DELETE" ? p.old : p.new;
                if (!row || !OWN_KEYS.test(row.key)) return;
                var v = p.eventType === "DELETE" ? null : parse(row.value);
                if (p.eventType !== "DELETE" && v === null) return;
                GB.writeLocal(row.key, v);
                dispatch(row.key, v);
            })
            .subscribe(function (s) {
                if (s === "SUBSCRIBED") status("on");
                else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") status("wait");
            });

        setInterval(GB.pullAll, CONFIG.POLL_MS);                    // safety net
        document.addEventListener("visibilitychange", function () { // phones put sockets to sleep
            if (document.visibilityState === "visible") GB.pullAll();
        });
    };

    window.GBStore = GB;
})();
