package lol.iliazeus.treeder;

import java.net.URI;
import java.util.regex.*;

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

    if (_views == null) {
      _views = new FrameLayout(this);
      setContentView(_views);
    }

    onNewIntent(getIntent());
  }

  protected void onNewIntent(Intent intent) {
    Uri.Builder url = Uri.parse("https://appassets.androidplatform.net/assets/index.html").buildUpon();

    if (_wv == null) {
      _wv = _createWebView();
      _views.addView(_wv);
      if (intent.getAction() == Intent.ACTION_MAIN)
        _wv.loadUrl(url.toString());
    }

    if (intent.getAction() == Intent.ACTION_SEND) {
      String postUrl = _findUrl(intent.getStringExtra(Intent.EXTRA_TEXT));
      if (postUrl != null)
        url.appendQueryParameter("post", postUrl);
      _wv.loadUrl(url.toString());
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

    wv.setOverScrollMode(View.OVER_SCROLL_NEVER);

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
        .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(MainActivity.this)).build();

    public WebResourceResponse shouldInterceptRequest(WebView wv, WebResourceRequest rq) {
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

    public void onPageStarted(WebView wv, String url, android.graphics.Bitmap favicon) {
      wv.clearHistory();
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
    if (keyCode == KeyEvent.KEYCODE_BACK && _wv.canGoBack()) {
      _wv.goBack();
      return true;
    }

    return super.onKeyDown(keyCode, event);
  }

  // https://mathiasbynens.be/demo/url-regex
  private static final Pattern URL_PATTERN = Pattern.compile(
      "https?://[^\\s/$.?#].[^\\s]*", Pattern.CASE_INSENSITIVE);

  private String _findUrl(String input) {
    if (input == null)
      return null;
    Matcher matcher = URL_PATTERN.matcher(input);
    if (matcher.find())
      return matcher.group();
    return null;
  }
}
