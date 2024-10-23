package main

import (
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

type AppListener struct {
	app chan App
	err chan error
}

type j = map[string]any

var appsFilename = ""
var apps = map[string]App{}
var pendingApps = map[string][]AppListener{}

func main() {
	appsFilename = os.Getenv("APPS_FILE")
	if appsFilename == "" {
		appsFilename = "apps.json"
	}

	slog.Info("reading stored apps", "filename", appsFilename)

	bytes, err := os.ReadFile(appsFilename)
	if err != nil {
		slog.Warn("error reading stored apps", "error", err)
	} else {
		json.Unmarshal(bytes, &apps)
	}

	slog.Info("loaded stored apps", "count", len(apps))
	for instance := range apps {
		slog.Info("loaded stored app", "instance", instance)
	}

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

		slog.Info("got request for app", "instance", instance)

		app, err := getOrRegisterApp(instance, slog.With("instance", instance))
		if err != nil {
			slog.Error("error while getting app", "instance", instance, "error", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(j{"error": err.Error()})
			return
		}

		slog.Info("returned response for app", "instance", instance)
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

func getOrRegisterApp(instance string, slog *slog.Logger) (App, error) {
	app, ok := apps[instance]
	if ok {
		slog.Info("got app from store")
		return app, nil
	}

	listeners, ok := pendingApps[instance]
	if ok {
		slog.Info("app pending")

		var listener AppListener
		pendingApps[instance] = append(listeners, listener)

		var app App
		var err error

		select {
		case app = <-listener.app:
			return app, nil
		case err = <-listener.err:
			return app, err
		}
	}

	slog.Info("no app stored, registering")

	pendingApps[instance] = make([]AppListener, 0)

	resp, err := http.PostForm("https://"+instance+"/api/v1/apps", url.Values{
		"client_name":   {"Tree Reader"},
		"website":       {"https://iliazeus.lol/mastodon-tree-reader/thread.html"},
		"redirect_uris": {"https://iliazeus.lol/mastodon-tree-reader/thread.html"},
		"scopes":        {"read"},
	})
	if err == nil && resp.StatusCode >= 400 {
		text, err := io.ReadAll(resp.Body)
		if err == nil {
			err = errors.New(string(text))
		}
	}
	if err == nil {
		err = json.NewDecoder(resp.Body).Decode(&app)
	}

	listeners = pendingApps[instance]
	delete(pendingApps, instance)

	if err != nil {
		for _, listener := range listeners {
			listener.err <- err
			close(listener.app)
			close(listener.err)
		}
		return app, err
	}

	for _, listener := range listeners {
		listener.app <- app
		close(listener.app)
		close(listener.err)
	}

	slog.Info("registered app, storing in file")

	apps[instance] = app
	bytes, _ := json.Marshal(apps)
	err = os.WriteFile(appsFilename, bytes, 0666)
	if err != nil {
		slog.Warn("error writing apps to file", "error", err)
	}

	return app, nil
}
