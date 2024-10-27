package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strings"
)

// https://docs.joinmastodon.org/entities/Application/#CredentialApplication
type App struct {
	Name                  string   `json:"name"`
	Website               string   `json:"website,omitempty"`
	Scopes                []string `json:"scopes"`
	RedirectUris          []string `json:"redirect_uris"`
	ClientId              string   `json:"client_id"`
	ClientSecret          string   `json:"client_secret"`
	ClientSecretExpiresAt string   `json:"client_secret_expires_at"`
}

type j = map[string]any

func main() {
	ctx := context.Background()

	filename := os.Getenv("APPS_FILE")
	if filename == "" {
		filename = "apps.json"
	}

	cache := NewAppCache(filename)
	go cache.Run(ctx)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /app", func(w http.ResponseWriter, r *http.Request) {
		query := r.URL.Query()

		instance := query.Get("instance")
		instance, _ = strings.CutPrefix(instance, "http://")
		instance, _ = strings.CutPrefix(instance, "https://")
		instance, _ = strings.CutSuffix(instance, "/")
		if instance == "" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(j{"error": "instance parameter not passed"})
			return
		}

		app, err := cache.Request(instance)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(j{"error": err})
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(app)
	})

	listenAddr := os.Getenv("LISTEN_ADDR")
	if listenAddr == "" {
		listenAddr = ":8080"
	}

	slog.Info("starting server", "addr", listenAddr)
	http.ListenAndServe(listenAddr, mux)
}

type appCacheRequest struct {
	instance string
	result   chan *App
	err      chan error
}

type AppCache struct {
	filename string
	apps     map[string]*App
	reqs     chan appCacheRequest
}

func NewAppCache(filename string) AppCache {
	slog.Info("reading stored apps", "filename", filename)

	apps := make(map[string]*App)
	bytes, err := os.ReadFile(filename)
	if err != nil {
		slog.Warn("error reading stored apps", "error", err)
	} else {
		json.Unmarshal(bytes, &apps)
	}

	slog.Info("loaded stored apps", "count", len(apps))
	for instance := range apps {
		slog.Info("loaded stored app", "instance", instance)
	}

	return AppCache{
		filename,
		apps,
		make(chan appCacheRequest),
	}
}

func (c *AppCache) Request(instance string) (*App, error) {
	apps := make(chan *App)
	errs := make(chan error)
	c.reqs <- appCacheRequest{instance, apps, errs}
	select {
	case err := <-errs:
		return nil, err
	case app := <-apps:
		return app, nil
	}
}

func (c *AppCache) Run(ctx context.Context) error {
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case req := <-c.reqs:
			slog := slog.With("instance", req.instance)
			slog.Info("got request for app")
			app, err := c.handleRequest(req.instance, slog)
			if err != nil {
				slog.Error("error while handling request", "error", err)
				req.err <- err
			} else {
				req.result <- app
			}
		}
	}
}

func (c *AppCache) handleRequest(instance string, slog *slog.Logger) (*App, error) {
	app := c.apps[instance]
	if app != nil {
		slog.Info("app found in cache")
		return app, nil
	}

	slog.Info("no app in cache, requesting from remote")
	res, err := http.PostForm("https://"+instance+"/api/v1/apps", url.Values{
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
	if err != nil {
		return nil, err
	}

	slog.Info("got response from remote, storing")
	c.apps[instance] = app
	bytes, err := json.Marshal(c.apps)
	if err == nil {
		err = os.WriteFile(c.filename, bytes, 0666)
	}
	if err != nil {
		slog.Warn("error writing apps to file", "error", err)
	}

	return app, nil
}
