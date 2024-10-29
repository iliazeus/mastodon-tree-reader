package main

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"sync"
	"time"
)

type j = map[string]any

func main() {
	filename := os.Getenv("APPS_FILE")
	if filename == "" {
		filename = "apps.json"
	}

	listenAddr := os.Getenv("LISTEN_ADDR")
	if listenAddr == "" {
		listenAddr = ":8080"
	}

	cache := NewAppCache(filename)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /app", func(w http.ResponseWriter, r *http.Request) {
		query := r.URL.Query()

		inst, err := ParseInstanceHost(query.Get("instance"))
		if err != nil {
			slog.Warn("bad request", "error", err)
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(j{"error": err.Error()})
			return
		}

		app, err := cache.LookupOrRegister(inst)
		if err != nil {
			slog.Warn("internal error", "instance", inst, "error", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(j{"error": err.Error()})
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(app)
	})

	slog.Info("listening", "addr", listenAddr)
	http.ListenAndServe(listenAddr, mux)
}

type AppCache struct {
	filename string
	mu       *sync.Mutex
	apps     map[InstanceHost]func() (*App, error)
}

func NewAppCache(filename string) *AppCache {
	c := &AppCache{filename, &sync.Mutex{}, map[InstanceHost]func() (*App, error){}}
	c.load()
	return c
}

func (c *AppCache) LookupOrRegister(inst InstanceHost) (*App, error) {
	c.mu.Lock()

	f, ok := c.apps[inst]
	if ok {
		slog.Info("found cached entry", "instance", inst)
	} else {
		slog.Info("no cached entry, registering app", "instance", inst)
		f = sync.OnceValues(func() (*App, error) {
			app, err := RegisterApp(inst)
			if err == nil {
				go c.store()
			} else {
				go c.deleteAfter(inst, 1*time.Second)
			}
			return app, err
		})
		c.apps[inst] = f
	}

	c.mu.Unlock()
	return f()
}

func (c *AppCache) deleteAfter(inst InstanceHost, d time.Duration) {
	<-time.After(d)
	c.mu.Lock()
	delete(c.apps, inst)
	c.mu.Unlock()
}

func (c *AppCache) load() {
	c.mu.Lock()
	defer c.mu.Unlock()

	slog.Info("loading stored cache", "filename", c.filename)

	appsJson := make(map[string]*App)

	bytes, err := os.ReadFile(c.filename)
	if err == nil {
		err = json.Unmarshal(bytes, &appsJson)
	}
	if err != nil {
		slog.Warn("error loading app cache", "error", err)
	} else {
		slog.Info("loaded stored cache", "len", len(appsJson))
		for k, v := range appsJson {
			c.apps[InstanceHost(k)] = func() (*App, error) {
				return v, nil
			}
			slog.Info("loaded stored cache entry", "instance", k)
		}
	}
}

func (c *AppCache) store() {
	c.mu.Lock()
	defer c.mu.Unlock()

	slog.Info("storing app cache", "len", len(c.apps))

	appsJson := make(map[string]*App)
	for k, v := range c.apps {
		app, err := v()
		if err == nil {
			appsJson[string(k)] = app
		}
	}

	bytes, err := json.MarshalIndent(appsJson, "", "  ")
	if err == nil {
		err = os.WriteFile(c.filename, bytes, 0666)
	}
	if err != nil {
		slog.Warn("error storing app cache", "error", err)
	} else {
		slog.Info("stored app cache")
	}
}

type InstanceHost string

var instanseHostRegexp = regexp.MustCompile("^(?:https?://)?(.*?)(?::80|:443)?(?:/.*)?$")
var ErrInvalidInstanceHost = errors.New("invalid instance host")

func ParseInstanceHost(h string) (InstanceHost, error) {
	m := instanseHostRegexp.FindStringSubmatch(h)
	if m != nil && m[1] != "" {
		return InstanceHost(m[1]), nil
	} else {
		return InstanceHost(""), ErrInvalidInstanceHost
	}
}

// https://docs.joinmastodon.org/entities/Application/#CredentialApplication
type App struct {
	Name                  string   `json:"name"`
	Website               string   `json:"website,omitempty"`
	Scopes                []string `json:"scopes"`
	RedirectUris          []string `json:"redirect_uris"`
	ClientId              string   `json:"client_id"`
	ClientSecret          string   `json:"client_secret"`
	ClientSecretExpiresAt string   `json:"client_secret_expires_at,omitempty"`
}

func RegisterApp(inst InstanceHost) (*App, error) {
	var app *App
	res, err := http.PostForm("https://"+string(inst)+"/api/v1/apps", url.Values{
		"client_name":   {"Tree Reader"},
		"website":       {"https://iliazeus.lol/mastodon-tree-reader/thread.html"},
		"redirect_uris": {"https://iliazeus.lol/mastodon-tree-reader/thread.html"},
		"scopes":        {"read"},
	})
	if err == nil && res.StatusCode >= 400 {
		text, err := io.ReadAll(res.Body)
		if err == nil {
			err = errors.New(string(text))
		}
	}
	if err == nil {
		err = json.NewDecoder(res.Body).Decode(&app)
	}
	return app, err
}
