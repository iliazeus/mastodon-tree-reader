package lol.iliazeus.treeder;

import java.util.regex.*;

import android.app.*;
import android.content.*;
import android.net.Uri;
import android.os.*;
import android.util.Log;

public class MainActivity extends Activity {
  private static final String TAG = "lol.iliazeus.treeder.MainService";

  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    onNewIntent(getIntent());
    finish();
  }

  private static final Uri BASE_URL = Uri.parse("https://iliazeus.github.io/mastodon-tree-reader/");

  protected void onNewIntent(Intent intent) {
    Uri.Builder url = BASE_URL.buildUpon();

    if (intent.getAction() == Intent.ACTION_SEND) {
      String postUrl = _findUrl(intent.getStringExtra(Intent.EXTRA_TEXT));
      if (postUrl != null)
        url.appendQueryParameter("post", postUrl);
    }

    startActivity(new Intent(Intent.ACTION_VIEW, url.build()));
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