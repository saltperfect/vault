import {
  click,
  visit,
  settled,
  currentURL,
  currentRouteName,
  fillIn,
  triggerKeyEvent,
  typeIn,
} from '@ember/test-helpers';
import { create } from 'ember-cli-page-object';
import { module, test } from 'qunit';
import { setupApplicationTest } from 'ember-qunit';
import editPage from 'vault/tests/pages/secrets/backend/kv/edit-secret';
import showPage from 'vault/tests/pages/secrets/backend/kv/show';
import listPage from 'vault/tests/pages/secrets/backend/list';

import mountSecrets from 'vault/tests/pages/settings/mount-secret-backend';
import apiStub from 'vault/tests/helpers/noop-all-api-requests';
import authPage from 'vault/tests/pages/auth';
import logout from 'vault/tests/pages/logout';
import consoleClass from 'vault/tests/pages/components/console/ui-panel';

const consoleComponent = create(consoleClass);

let writeSecret = async function(backend, path, key, val) {
  await listPage.visitRoot({ backend });
  await listPage.create();
  return editPage.createSecret(path, key, val);
};

module('Acceptance | secrets/secret/create', function(hooks) {
  setupApplicationTest(hooks);

  hooks.beforeEach(async function() {
    this.server = apiStub({ usePassthrough: true });
    return authPage.login();
  });

  hooks.afterEach(function() {
    this.server.shutdown();
  });

  test('it creates a secret and redirects', async function(assert) {
    const path = `kv-path-${new Date().getTime()}`;
    await listPage.visitRoot({ backend: 'secret' });
    await settled();
    assert.equal(currentRouteName(), 'vault.cluster.secrets.backend.list-root', 'navigates to the list page');

    await listPage.create();
    await settled();
    await editPage.toggleMetadata();
    await settled();
    assert.ok(editPage.hasMetadataFields, 'shows the metadata form');
    await editPage.createSecret(path, 'foo', 'bar');
    await settled();

    assert.equal(currentRouteName(), 'vault.cluster.secrets.backend.show', 'redirects to the show page');
    assert.ok(showPage.editIsPresent, 'shows the edit button');
  });

  test('it can create a secret when check-and-set is required', async function(assert) {
    let enginePath = `kv-${new Date().getTime()}`;
    let secretPath = 'foo/bar';
    await mountSecrets.visit();
    await mountSecrets.enable('kv', enginePath);
    await consoleComponent.runCommands(`write ${enginePath}/config cas_required=true`);
    await writeSecret(enginePath, secretPath, 'foo', 'bar');
    assert.equal(currentRouteName(), 'vault.cluster.secrets.backend.show', 'redirects to the show page');
    assert.ok(showPage.editIsPresent, 'shows the edit button');
  });

  test('it can create a secret with a non default max version and add metadata', async function(assert) {
    let enginePath = `kv-${new Date().getTime()}`;
    let secretPath = 'maxVersions';
    let maxVersions = 101;
    await mountSecrets.visit();
    await mountSecrets.enable('kv', enginePath);
    await settled();
    await editPage.startCreateSecret();
    await editPage.path(secretPath);
    await editPage.toggleMetadata();
    await settled();
    await editPage.maxVersion(maxVersions);
    await settled();
    await editPage.save();
    await settled();
    await editPage.metadataTab();
    await settled();
    let savedMaxVersions = Number(
      document.querySelector('[data-test-value-div="Maximum versions"]').innerText
    );
    assert.equal(
      maxVersions,
      savedMaxVersions,
      'max_version displays the saved number set when creating the secret'
    );
    // add metadata
    await click('[data-test-add-custom-metadata]');
    await fillIn('[data-test-kv-key]', 'key');
    await fillIn('[data-test-kv-value]', 'value');
    await click('[data-test-save-metadata]');
    let key = document.querySelector('[data-test-row-label="key"]').innerText;
    let value = document.querySelector('[data-test-row-value="key"]').innerText;
    assert.equal(key, 'key', 'metadata key displays after adding it.');
    assert.equal(value, 'value', 'metadata value displays after adding it.');
  });

  test('it can handle validation on custom metadata', async function(assert) {
    let enginePath = `kv-${new Date().getTime()}`;
    let secretPath = 'customMetadataValidations';

    await mountSecrets.visit();
    await mountSecrets.enable('kv', enginePath);
    await settled();
    await editPage.startCreateSecret();
    await editPage.path(secretPath);
    await editPage.toggleMetadata();
    await settled();
    await typeIn('[data-test-kv-value]', 'invalid\\/');
    assert
      .dom('[data-test-inline-error-message]')
      .hasText('Custom values cannot contain a backward slash.', 'will not allow backward slash in value.');
    //remove validation error and cause another error that is captured by the API
    await fillIn('[data-test-kv-value]', 'removed');
    await typeIn('[data-test-kv-value]', '!');
    await click('[data-test-secret-save="true"]');
    assert
      .dom('[data-test-error]')
      .includesText(
        'custom_metadata validation failed: length of key',
        'shows API error that is not captured by validation'
      );
  });

  test('it can create a secret with config metadata', async function(assert) {
    let enginePath = `kv-${new Date().getTime()}`;
    let maxVersion = 101;
    await mountSecrets.visit();
    await click('[data-test-mount-type="kv"]');
    await settled();
    await click('[data-test-mount-next]');
    await settled();
    await fillIn('[data-test-input="path"]', enginePath);
    await fillIn('[data-test-input="maxVersions"]', maxVersion);
    await click('[data-test-input="casRequired"]');
    await click('[data-test-toggle-label="Automate secret deletion"]');
    await fillIn('[data-test-ttl-value="Automate secret deletion"]', '1');
    await click('[data-test-mount-submit="true"]');
    await settled();
    await click('[data-test-configuration-tab]');
    await settled();
    let cas = document.querySelector('[data-test-value-div="Require Check and Set"]').innerText;
    let deleteVersionAfter = document.querySelector('[data-test-value-div="Automate secret deletion"]')
      .innerText;
    let savedMaxVersion = document.querySelector('[data-test-value-div="Maximum number of versions"]')
      .innerText;

    assert.equal(
      maxVersion,
      savedMaxVersion,
      'displays the max version set when configuring the secret-engine'
    );
    assert.equal(cas.trim(), 'Yes', 'displays the cas set when configuring the secret-engine');
    assert.equal(
      deleteVersionAfter.trim(),
      '1s',
      'displays the delete version after set when configuring the secret-engine'
    );
  });

  test('it can create a secret and metadata can be created and edited', async function(assert) {
    let enginePath = `kv-${new Date().getTime()}`;
    let secretPath = 'metadata';
    let maxVersions = 101;
    await mountSecrets.visit();
    await mountSecrets.enable('kv', enginePath);
    await settled();
    await editPage.startCreateSecret();
    await editPage.path(secretPath);
    await editPage.toggleMetadata();
    await settled();
    await fillIn('[data-test-input="maxVersions"]', maxVersions);
    await settled();
    await editPage.save();
    await settled();
    await editPage.metadataTab();
    await settled();
    let savedMaxVersions = Number(document.querySelectorAll('[data-test-value-div]')[0].innerText);
    assert.equal(
      maxVersions,
      savedMaxVersions,
      'max_version displays the saved number set when creating the secret'
    );
  });

  test('it disables save when validation errors occur', async function(assert) {
    let enginePath = `kv-${new Date().getTime()}`;
    await mountSecrets.visit();
    await mountSecrets.enable('kv', enginePath);
    await settled();
    await editPage.startCreateSecret();
    await typeIn('[data-test-secret-path="true"]', 'beep');
    assert
      .dom('[data-test-inline-error-message]')
      .hasText(
        'A secret with this path already exists.',
        'when duplicate path it shows correct error message'
      );

    await editPage.toggleMetadata();
    await settled();
    await typeIn('[data-test-input="maxVersions"]', 'abc');
    await settled();
    assert
      .dom('[data-test-input="maxVersions"]')
      .hasClass('has-error-border', 'shows border error on input with error');
    assert.dom('[data-test-secret-save="true"]').isDisabled('Save button is disabled');
    await fillIn('[data-test-input="maxVersions"]', 20); // fillIn replaces the text, whereas typeIn only adds to it.
    await triggerKeyEvent('[data-test-input="maxVersions"]', 'keyup', 65);
    await editPage.path('meep');
    await triggerKeyEvent('[data-test-secret-path="true"]', 'keyup', 65);
    await click('[data-test-secret-save="true"]');
    assert.equal(currentURL(), `/vault/secrets/${enginePath}/show/meep`, 'navigates to show secret');
  });

  test('it navigates to version history and to a specific version', async function(assert) {
    const path = `kv-path-${new Date().getTime()}`;
    let today = new Date();
    let month = today.toString().split(' ')[1];
    await listPage.visitRoot({ backend: 'secret' });
    await settled();
    await listPage.create();
    await settled();
    await editPage.createSecret(path, 'foo', 'bar');
    await click('[data-test-popup-menu-trigger="version"]');
    await settled();
    assert.dom('[ data-test-created-time]').includesText(month, 'created time shows todays month');

    await click('[data-test-version-history]');
    await settled();
    assert
      .dom('[data-test-list-item-content]')
      .includesText('Version 1 Current', 'shows version one data on the version history as current');
    assert.dom('[data-test-list-item-content]').exists({ count: 1 }, 'renders a single version');

    await click('.linked-block');
    await settled();
    await settled();
    assert.dom('[data-test-masked-input]').hasText('bar', 'renders secret on the secret version show page');
    assert.equal(
      currentURL(),
      `/vault/secrets/secret/show/${path}?version=1`,
      'redirects to the show page with queryParam version=1'
    );
  });

  test('version 1 performs the correct capabilities lookup and does not show metadata tab', async function(assert) {
    let enginePath = `kv-${new Date().getTime()}`;
    let secretPath = 'foo/bar';
    // mount version 1 engine
    await mountSecrets.visit();
    await mountSecrets.selectType('kv');
    await mountSecrets
      .next()
      .path(enginePath)
      .toggleOptions()
      .version(1)
      .submit();
    await listPage.create();
    await editPage.createSecret(secretPath, 'foo', 'bar');
    assert.equal(currentRouteName(), 'vault.cluster.secrets.backend.show', 'redirects to the show page');
    assert.ok(showPage.editIsPresent, 'shows the edit button');
    //check for metadata tab should not exist on KV version 1
    assert.dom('[data-test-secret-metadata-tab]').doesNotExist('does not show metadata tab');
  });

  // https://github.com/hashicorp/vault/issues/5960
  test('version 1: nested paths creation maintains ability to navigate the tree', async function(assert) {
    let enginePath = `kv-${new Date().getTime()}`;
    let secretPath = '1/2/3/4';
    // mount version 1 engine
    await mountSecrets.visit();
    await mountSecrets.selectType('kv');
    await mountSecrets
      .next()
      .path(enginePath)
      .toggleOptions()
      .version(1)
      .submit();
    await listPage.create();
    await editPage.createSecret(secretPath, 'foo', 'bar');

    // setup an ancestor for when we delete
    await listPage.visitRoot({ backend: enginePath });
    await listPage.secrets.filterBy('text', '1/')[0].click();
    await listPage.create();
    await editPage.createSecret('1/2', 'foo', 'bar');

    // lol we have to do this because ember-cli-page-object doesn't like *'s in visitable
    await listPage.visitRoot({ backend: enginePath });
    await listPage.secrets.filterBy('text', '1/')[0].click();
    await listPage.secrets.filterBy('text', '2/')[0].click();
    await listPage.secrets.filterBy('text', '3/')[0].click();
    await listPage.create();

    await editPage.createSecret(secretPath + 'a', 'foo', 'bar');
    await listPage.visitRoot({ backend: enginePath });
    await listPage.secrets.filterBy('text', '1/')[0].click();
    await listPage.secrets.filterBy('text', '2/')[0].click();
    let secretLink = listPage.secrets.filterBy('text', '3/')[0];
    assert.ok(secretLink, 'link to the 3/ branch displays properly');

    await listPage.secrets.filterBy('text', '3/')[0].click();
    await listPage.secrets.objectAt(0).menuToggle();
    await settled();
    await listPage.delete();
    await listPage.confirmDelete();
    await settled();
    assert.equal(currentRouteName(), 'vault.cluster.secrets.backend.list');
    assert.equal(currentURL(), `/vault/secrets/${enginePath}/list/1/2/3/`, 'remains on the page');

    await listPage.secrets.objectAt(0).menuToggle();
    await listPage.delete();
    await listPage.confirmDelete();
    await settled();
    assert.equal(currentRouteName(), 'vault.cluster.secrets.backend.list');
    assert.equal(
      currentURL(),
      `/vault/secrets/${enginePath}/list/1/`,
      'navigates to the ancestor created earlier'
    );
  });

  test('first level secrets redirect properly upon deletion', async function(assert) {
    let enginePath = `kv-${new Date().getTime()}`;
    let secretPath = 'test';
    // mount version 1 engine
    await mountSecrets.visit();
    await mountSecrets.selectType('kv');
    await mountSecrets
      .next()
      .path(enginePath)
      .toggleOptions()
      .version(1)
      .submit();
    await listPage.create();
    await editPage.createSecret(secretPath, 'foo', 'bar');
    await showPage.deleteSecretV1();
    assert.equal(
      currentRouteName(),
      'vault.cluster.secrets.backend.list-root',
      'redirected to the list page on delete'
    );
  });

  // https://github.com/hashicorp/vault/issues/5994
  test('version 1: key named keys', async function(assert) {
    await consoleComponent.runCommands([
      'vault write sys/mounts/test type=kv',
      'refresh',
      'vault write test/a keys=a keys=b',
    ]);
    await showPage.visit({ backend: 'test', id: 'a' });
    assert.ok(showPage.editIsPresent, 'renders the page properly');
  });

  test('it redirects to the path ending in / for list pages', async function(assert) {
    const path = `foo/bar/kv-path-${new Date().getTime()}`;
    await listPage.visitRoot({ backend: 'secret' });
    await listPage.create();
    await editPage.createSecret(path, 'foo', 'bar');
    await settled();
    // use visit helper here because ids with / in them get encoded
    await visit('/vault/secrets/secret/list/foo/bar');
    assert.equal(currentRouteName(), 'vault.cluster.secrets.backend.list');
    assert.ok(currentURL().endsWith('/'), 'redirects to the path ending in a slash');
  });

  test('it can edit via the JSON input', async function(assert) {
    let content = JSON.stringify({ foo: 'fa', bar: 'boo' });
    const path = `kv-path-${new Date().getTime()}`;
    await listPage.visitRoot({ backend: 'secret' });
    await listPage.create();
    await editPage.path(path).toggleJSON();
    await editPage.editor.fillIn(this, content);
    await editPage.save();

    assert.equal(currentRouteName(), 'vault.cluster.secrets.backend.show', 'redirects to the show page');
    assert.ok(showPage.editIsPresent, 'shows the edit button');
    assert.equal(
      showPage.editor.content(this),
      JSON.stringify({ bar: 'boo', foo: 'fa' }, null, 2),
      'saves the content'
    );
  });

  test('paths are properly encoded', async function(assert) {
    let backend = 'kv';
    let paths = [
      '(',
      ')',
      '"',
      //"'",
      '!',
      '#',
      '$',
      '&',
      '*',
      '+',
      '@',
      '{',
      '|',
      '}',
      '~',
      '[',
      '\\',
      ']',
      '^',
      '_',
    ].map(char => `${char}some`);
    assert.expect(paths.length * 2);
    let secretName = '2';
    let commands = paths.map(path => `write '${backend}/${path}/${secretName}' 3=4`);
    await consoleComponent.runCommands(['write sys/mounts/kv type=kv', ...commands]);
    for (let path of paths) {
      await listPage.visit({ backend, id: path });
      assert.ok(listPage.secrets.filterBy('text', '2')[0], `${path}: secret is displayed properly`);
      await listPage.secrets.filterBy('text', '2')[0].click();
      assert.equal(
        currentRouteName(),
        'vault.cluster.secrets.backend.show',
        `${path}: show page renders correctly`
      );
    }
  });

  test('create secret with space shows version data', async function(assert) {
    let enginePath = `kv-${new Date().getTime()}`;
    let secretPath = 'space space';
    // mount version 2
    await mountSecrets.visit();
    await mountSecrets.selectType('kv');
    await mountSecrets
      .next()
      .path(enginePath)
      .submit();
    await settled();
    await listPage.create();
    await editPage.createSecret(secretPath, 'foo', 'bar');
    await settled();
    await click('[data-test-popup-menu-trigger="version"]');
    await settled();
    await click('[data-test-version-history]');
    await settled();
    assert.dom('[data-test-list-item-content]').exists('renders the version and not an error state');
    // click on version
    await click('[data-test-popup-menu-trigger="true"]');
    await click('[data-test-version]');
    await settled();
    // perform encode function that should be done by the encodePath
    let encodedSecretPath = secretPath.replace(/ /g, '%20');
    assert.equal(currentURL(), `/vault/secrets/${enginePath}/show/${encodedSecretPath}?version=1`);
  });

  // the web cli does not handle a quote as part of a path, so we test it here via the UI
  test('creating a secret with a single or double quote works properly', async function(assert) {
    await consoleComponent.runCommands('write sys/mounts/kv type=kv');
    let paths = ["'some", '"some'];
    for (let path of paths) {
      await listPage.visitRoot({ backend: 'kv' });
      await listPage.create();
      await editPage.createSecret(`${path}/2`, 'foo', 'bar');
      await listPage.visit({ backend: 'kv', id: path });
      assert.ok(listPage.secrets.filterBy('text', '2')[0], `${path}: secret is displayed properly`);
      await listPage.secrets.filterBy('text', '2')[0].click();
      assert.equal(
        currentRouteName(),
        'vault.cluster.secrets.backend.show',
        `${path}: show page renders correctly`
      );
    }
  });

  test('filter clears on nav', async function(assert) {
    await consoleComponent.runCommands([
      'vault write sys/mounts/test type=kv',
      'refresh',
      'vault write test/filter/foo keys=a keys=b',
      'vault write test/filter/foo1 keys=a keys=b',
      'vault write test/filter/foo2 keys=a keys=b',
    ]);
    await listPage.visit({ backend: 'test', id: 'filter' });
    assert.equal(listPage.secrets.length, 3, 'renders three secrets');
    await listPage.filterInput('filter/foo1');
    assert.equal(listPage.secrets.length, 1, 'renders only one secret');
    await listPage.secrets.objectAt(0).click();
    await showPage.breadcrumbs.filterBy('text', 'filter')[0].click();
    assert.equal(listPage.secrets.length, 3, 'renders three secrets');
    assert.equal(listPage.filterInputValue, 'filter/', 'pageFilter has been reset');
  });

  // All policy test below this line
  test('version 2 with restricted policy still allows creation and does not show metadata tab', async function(assert) {
    let backend = 'kv-v2';
    const V2_POLICY = `
      path "kv-v2/metadata/*" {
        capabilities = ["list"]
      }
      path "kv-v2/data/secret" {
        capabilities = ["create", "read", "update"]
      }
    `;
    await consoleComponent.runCommands([
      `write sys/mounts/${backend} type=kv options=version=2`,
      `write sys/policies/acl/kv-v2-degrade policy=${btoa(V2_POLICY)}`,
      // delete any kv previously written here so that tests can be re-run
      'delete kv-v2/metadata/secret',
      'write -field=client_token auth/token/create policies=kv-v2-degrade',
    ]);

    let userToken = consoleComponent.lastLogOutput;
    await logout.visit();
    await authPage.login(userToken);

    await writeSecret(backend, 'secret', 'foo', 'bar');
    assert.equal(currentRouteName(), 'vault.cluster.secrets.backend.show', 'redirects to the show page');
    assert.ok(showPage.editIsPresent, 'shows the edit button');
    //check for metadata tab which should not show because you don't have read capabilities
    assert.dom('[data-test-secret-metadata-tab]').doesNotExist('does not show metadata tab');
  });

  test('version 2: with metadata no read or list access but access to the data endpoint', async function(assert) {
    let backend = 'no-metadata-read';
    let V2_POLICY_NO_LIST = `
      path "${backend}/metadata/*" {
        capabilities = ["create","update"]
      }
      path "${backend}/data/*" {
        capabilities = ["create", "read", "update"]
      }
    `;
    await consoleComponent.runCommands([
      // delete any kv previously written here so that tests can be re-run
      `delete ${backend}/metadata/secret-path`,
      // delete any previous mount with same name
      `delete sys/mounts/${backend}`,
      `write sys/mounts/${backend} type=kv options=version=2`,
      `write sys/policies/acl/metadata-no-list policy=${btoa(V2_POLICY_NO_LIST)}`,
      'write -field=client_token auth/token/create policies=metadata-no-list',
    ]);
    await settled();
    let userToken2 = consoleComponent.lastLogOutput;
    await settled();
    await listPage.visitRoot({ backend });
    await settled();
    await listPage.create();
    await settled();
    await editPage.createSecretWithMetadata('secret-path', 'secret-key', 'secret-value', 101);
    await settled();
    await logout.visit();
    await settled();
    await authPage.login(userToken2);
    await settled();
    // test if metadata tab there and error and no edit. and you can’t see metadata that was setup.
    await click(`[data-test-auth-backend-link=${backend}]`);
    await settled();
    // this fails in IE11 on browserstack so going directly to URL
    // let card = document.querySelector('[data-test-search-roles]').childNodes[1];
    // await typeIn(card.querySelector('input'), 'secret-path');
    // await settled();
    await visit('/vault/secrets/no-metadata-read/show/secret-path');
    // await click('[data-test-get-credentials]');
    await settled();
    await assert
      .dom('[data-test-value-div="secret-key"]')
      .exists('secret view page and info table row with secret-key value');
    // check metadata
    await click('[data-test-secret-metadata-tab]');
    await settled();
    assert
      .dom('[data-test-empty-state-message]')
      .hasText(
        'In order to edit secret metadata access, the UI requires read permissions; otherwise, data may be deleted. Edits can still be made via the API and CLI.'
      );
  });

  // KV delete operations testing
  test('version 2 with policy with destroy capabilities shows modal', async function(assert) {
    let backend = 'kv-v2';
    const V2_POLICY = `
      path "kv-v2/destroy/*" {
        capabilities = ["update"]
      }
      path "kv-v2/metadata/*" {
        capabilities = ["list", "update", "delete"]
      }
      path "kv-v2/data/secret" {
        capabilities = ["create", "read", "update"]
      }
    `;
    await consoleComponent.runCommands([
      `write sys/mounts/${backend} type=kv options=version=2`,
      `write sys/policies/acl/kv-v2-degrade policy=${btoa(V2_POLICY)}`,
      // delete any kv previously written here so that tests can be re-run
      'delete kv-v2/metadata/secret',
      'write -field=client_token auth/token/create policies=kv-v2-degrade',
    ]);

    let userToken = consoleComponent.lastLogOutput;
    await logout.visit();
    await authPage.login(userToken);

    await writeSecret(backend, 'secret', 'foo', 'bar');
    await click('[data-test-delete-open-modal]');
    await settled();
    assert.dom('[data-test-delete-modal="destroy-version"]').exists('destroy this version option shows');
    assert.dom('[data-test-delete-modal="destroy-all-versions"]').exists('destroy all versions option shows');
    assert.dom('[data-test-delete-modal="delete-version"]').doesNotExist('delete version does not show');
  });

  test('version 2 with policy with only delete option does not show modal and undelete is an option', async function(assert) {
    let backend = 'kv-v2';
    const V2_POLICY = `
      path "kv-v2/delete/*" {
        capabilities = ["update"]
      }
      path "kv-v2/undelete/*" {
        capabilities = ["update"]
      }
      path "kv-v2/metadata/*" {
        capabilities = ["list","read","create","update"]
      }
      path "kv-v2/data/secret" {
        capabilities = ["create", "read"]
      }
    `;
    await consoleComponent.runCommands([
      `write sys/mounts/${backend} type=kv options=version=2`,
      `write sys/policies/acl/kv-v2-degrade policy=${btoa(V2_POLICY)}`,
      // delete any kv previously written here so that tests can be re-run
      'delete kv-v2/metadata/secret',
      'write -field=client_token auth/token/create policies=kv-v2-degrade',
    ]);

    let userToken = consoleComponent.lastLogOutput;
    await logout.visit();
    await authPage.login(userToken);
    await writeSecret(backend, 'secret', 'foo', 'bar');
    assert.dom('[data-test-delete-open-modal]').doesNotExist('delete version does not show');
    assert.dom('[data-test-secret-v2-delete="true"]').exists('drop down delete shows');
    await showPage.deleteSecretV2();
    // unable to reload page in test scenario so going to list and back to secret to confirm deletion
    let url = `/vault/secrets/${backend}/list`;
    await visit(url);
    await click('[data-test-secret-link="secret"]');
    assert.dom('[data-test-component="empty-state"]').exists('secret has been deleted');
    assert.dom('[data-test-secret-undelete]').exists('undelete button shows');
  });

  test('version 2 with path forward slash will show delete button', async function(assert) {
    let backend = 'kv-v2';
    const V2_POLICY = `
      path "kv-v2/delete/forward/slash" {
        capabilities = ["update"]
      }
      path "kv-v2/metadata/*" {
        capabilities = ["list","read","create","update"]
      }
      path "kv-v2/data/forward/slash" {
        capabilities = ["create", "read"]
      }
    `;
    await consoleComponent.runCommands([
      `write sys/mounts/${backend} type=kv options=version=2`,
      `write sys/policies/acl/kv-v2-degrade policy=${btoa(V2_POLICY)}`,
      // delete any kv previously written here so that tests can be re-run
      'delete kv-v2/metadata/forward/slash',
      'write -field=client_token auth/token/create policies=kv-v2-degrade',
    ]);

    let userToken = consoleComponent.lastLogOutput;
    await logout.visit();
    await authPage.login(userToken);
    await writeSecret(backend, 'forward/slash', 'foo', 'bar');
    assert.dom('[data-test-secret-v2-delete="true"]').exists('drop down delete shows');
  });

  test('version 2 with engine with forward slash will show delete button', async function(assert) {
    let backend = 'forward/slash';
    const V2_POLICY = `
      path "forward/slash/delete/secret" {
        capabilities = ["update"]
      }
      path "forward/slash/metadata/*" {
        capabilities = ["list","read","create","update"]
      }
      path "forward/slash/data/*" {
        capabilities = ["create", "read"]
      }
    `;
    await consoleComponent.runCommands([
      `write sys/mounts/${backend} type=kv options=version=2`,
      `write sys/policies/acl/kv-v2-degrade policy=${btoa(V2_POLICY)}`,
      // delete any kv previously written here so that tests can be re-run
      'delete forward/slash/metadata/secret',
      'write -field=client_token auth/token/create policies=kv-v2-degrade',
    ]);

    let userToken = consoleComponent.lastLogOutput;
    await logout.visit();
    await authPage.login(userToken);
    await writeSecret(backend, 'secret', 'foo', 'bar');
    assert.dom('[data-test-secret-v2-delete="true"]').exists('drop down delete shows');
  });
  // end of KV delete operation testing

  let setupNoRead = async function(backend, canReadMeta = false) {
    const V2_WRITE_ONLY_POLICY = `
      path "${backend}/+/+" {
        capabilities = ["create", "update", "list"]
      }
      path "${backend}/+" {
        capabilities = ["list"]
      }
    `;

    const V2_WRITE_WITH_META_READ_POLICY = `
      path "${backend}/+/+" {
        capabilities = ["create", "update", "list"]
      }
      path "${backend}/metadata/+" {
        capabilities = ["read"]
      }
      path "${backend}/+" {
        capabilities = ["list"]
      }
    `;
    const V1_WRITE_ONLY_POLICY = `
     path "${backend}/+" {
        capabilities = ["create", "update", "list"]
      }
    `;

    let policy;
    if (backend === 'kv-v2' && canReadMeta) {
      policy = V2_WRITE_WITH_META_READ_POLICY;
    } else if (backend === 'kv-v2') {
      policy = V2_WRITE_ONLY_POLICY;
    } else if (backend === 'kv-v1') {
      policy = V1_WRITE_ONLY_POLICY;
    }
    await consoleComponent.runCommands([
      // disable any kv previously enabled kv
      `delete sys/mounts/${backend}`,
      `write sys/mounts/${backend} type=kv options=version=${backend === 'kv-v2' ? 2 : 1}`,
      `write sys/policies/acl/${backend} policy=${btoa(policy)}`,
      `write -field=client_token auth/token/create policies=${backend}`,
    ]);

    return consoleComponent.lastLogOutput;
  };
  test('write without read: version 2', async function(assert) {
    let backend = 'kv-v2';
    let userToken = await setupNoRead(backend);
    await writeSecret(backend, 'secret', 'foo', 'bar');
    await logout.visit();
    await authPage.login(userToken);

    await showPage.visit({ backend, id: 'secret' });
    assert.ok(showPage.noReadIsPresent, 'shows no read empty state');
    assert.ok(showPage.editIsPresent, 'shows the edit button');

    await editPage.visitEdit({ backend, id: 'secret' });
    assert.notOk(editPage.hasMetadataFields, 'hides the metadata form');

    await editPage.editSecret('bar', 'baz');
    assert.equal(currentRouteName(), 'vault.cluster.secrets.backend.show', 'redirects to the show page');
  });

  test('write without read: version 2 with metadata read', async function(assert) {
    let backend = 'kv-v2';
    let userToken = await setupNoRead(backend, true);
    await writeSecret(backend, 'secret', 'foo', 'bar');
    await logout.visit();
    await authPage.login(userToken);

    await showPage.visit({ backend, id: 'secret' });
    assert.ok(showPage.noReadIsPresent, 'shows no read empty state');
    assert.ok(showPage.editIsPresent, 'shows the edit button');

    await editPage.visitEdit({ backend, id: 'secret' });
    assert
      .dom('[data-test-warning-no-read-permissions]')
      .exists('shows custom warning instead of default API warning about permissions');

    await editPage.editSecret('bar', 'baz');
    assert.equal(currentRouteName(), 'vault.cluster.secrets.backend.show', 'redirects to the show page');
  });

  test('write without read: version 1', async function(assert) {
    let backend = 'kv-v1';
    let userToken = await setupNoRead(backend);
    await writeSecret(backend, 'secret', 'foo', 'bar');
    await logout.visit();
    await authPage.login(userToken);

    await showPage.visit({ backend, id: 'secret' });
    assert.ok(showPage.noReadIsPresent, 'shows no read empty state');
    assert.ok(showPage.editIsPresent, 'shows the edit button');

    await editPage.visitEdit({ backend, id: 'secret' });
    await editPage.editSecret('bar', 'baz');
    assert.equal(currentRouteName(), 'vault.cluster.secrets.backend.show', 'redirects to the show page');
  });
});
