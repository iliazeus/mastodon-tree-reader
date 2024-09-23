package lol.iliazeus.treeder;

import java.net.URI;

import android.app.*;
import android.content.Intent;
import android.net.Uri;
import android.os.*;
import android.util.Log;
import android.view.*;
import android.webkit.*;
import android.widget.FrameLayout;

import androidx.webkit.*;

public class MainActivity extends Activity {
  private static final String TAG = "lol.iliazeus.treeder.MainActivity";

  private FrameLayout _views;
  private WebView _wv;

  private static final int RQ_FILE_CHOOSER = 1;
  private ValueCallback<Uri[]> _fileChooserCb = null;
  private WebChromeClient.FileChooserParams _fileChooserParams = null;

  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getActionBar().hide();

    String postUrl = null;
    if (getIntent().getAction() == Intent.ACTION_SEND) {
      postUrl = getIntent().getStringExtra(Intent.EXTRA_TEXT);
    }

    if (_views == null) {
      _views = new FrameLayout(this);
      setContentView(_views);
    }

    Uri.Builder url = Uri.parse("https://appassets.androidplatform.net/assets/index.html").buildUpon();

    if (_wv == null) {
      _wv = _createWebView();
      _views.addView(_wv);
      _wv.loadUrl(url.toString());
    }

    if (getIntent().getAction() == Intent.ACTION_SEND) {
      url.appendQueryParameter("url", getIntent().getStringExtra(Intent.EXTRA_TEXT));
      _wv.loadUrl(url.toString());
      _wv.clearHistory();
    }
  }

  protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    if (requestCode == RQ_FILE_CHOOSER) {
      Uri[] uris = _fileChooserParams.parseResult(resultCode, data);
      _fileChooserCb.onReceiveValue(uris);
      _fileChooserCb = null;
      _fileChooserParams = null;
    }
  }

  private WebView _createWebView() {
    WebView wv = new WebView(this);

    WebSettings settings = wv.getSettings();
    settings.setAllowContentAccess(false);
    settings.setAllowFileAccess(false);
    settings.setDomStorageEnabled(true);
    settings.setJavaScriptEnabled(true);

    wv.setWebViewClient(_webViewClient);
    wv.setWebChromeClient(_webChromeClient);

    return wv;
  }

  private WebViewClient _webViewClient = new WebViewClient() {
    WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
        .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(MainActivity.this))
        .build();

    public WebResourceResponse shouldInterceptRequest(WebView wv,
        WebResourceRequest rq) {
      return assetLoader.shouldInterceptRequest(rq.getUrl());
    }

    public boolean shouldOverrideUrlLoading(WebView wv, WebResourceRequest rq) {
      boolean isAssetRequest = rq.getUrl().getHost().equals("appassets.androidplatform.net");
      boolean isOauthNavigation = rq.getUrl().getPath().equals("/oauth/authorize");

      if (rq.isRedirect() && isAssetRequest) {
        wv.loadUrl(rq.getUrl().toString());
        return true;
      }

      if (rq.isForMainFrame() && rq.hasGesture() && !isAssetRequest && !isOauthNavigation) {
        wv.getContext().startActivity(new Intent(Intent.ACTION_VIEW, rq.getUrl()));
        return true;
      }

      return false;
    }
  };

  private WebChromeClient _webChromeClient = new WebChromeClient() {
    public boolean onShowFileChooser(WebView wv,
        ValueCallback<Uri[]> cb, FileChooserParams params) {
      _fileChooserCb = cb;
      _fileChooserParams = params;

      Intent intent = params.createIntent();
      startActivityForResult(intent, RQ_FILE_CHOOSER);
      return true;
    }

    public void onShowCustomView(View view, CustomViewCallback cb) {
      _views.addView(view);
    }

    public void onHideCustomView() {
      View v = _views.getChildAt(_views.getChildCount() - 1);
      _views.removeView(v);
    }
  };

  public boolean onKeyDown(int keyCode, KeyEvent event) {
    if (keyCode == KeyEvent.KEYCODE_BACK) {
      WebView wv = (WebView) _views.getFocusedChild();
      if (wv != null && wv.canGoBack()) {
        wv.goBack();
        return true;
      }
    }

    return super.onKeyDown(keyCode, event);
  }
}
