import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('release', Path(__file__).parents[1]/'deploy/poll-github-release.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
SHA = 'a'*40
class DeploySafety(unittest.TestCase):
    def exercise(self, states, fail_build=False):
        calls=[]
        def run(args, **kw):
            calls.append(args)
            if fail_build and args[-2:] == ['build','app']:
                raise RuntimeError('fixture build failed')
        with tempfile.TemporaryDirectory() as d:
            root=Path(d); (root/'releases'/SHA).mkdir(parents=True)
            with patch.object(m,'ROOT',root), patch.object(m,'fetch_json',return_value={'sha':SHA}), patch.object(m,'health',side_effect=states), patch.object(m,'run',side_effect=run), patch.object(m.subprocess,'run',return_value=SimpleNamespace(stdout='sha256:'+'b'*64)), patch.object(m.shutil,'disk_usage',return_value=SimpleNamespace(free=10*1024**3)), patch.object(m.time,'sleep'):
                error=None
                try:m.main()
                except RuntimeError as e:error=str(e)
                return calls,error,(root/'last-deploy.json').exists()
    def test_already_healthy_does_not_rebuild(self):
        calls,error,receipt=self.exercise([{'success':True,'commit':SHA}]);self.assertEqual(calls,[]);self.assertIsNone(error)
    def test_failed_build_never_replaces_running_site(self):
        calls,error,receipt=self.exercise([{'success':True,'commit':'old'}],True);self.assertTrue(error);self.assertFalse(any('up' in c for c in calls));self.assertFalse(receipt)
    def test_unhealthy_new_revision_rolls_back(self):
        calls,error,receipt=self.exercise([{'success':True,'commit':'old'}]+[{}]*36);self.assertTrue(error);self.assertTrue(any(c[:3]==['sudo','docker','tag'] for c in calls));self.assertFalse(receipt)
    def test_receipt_only_after_exact_revision_health(self):
        calls,error,receipt=self.exercise([{'success':True,'commit':'old'},{'success':True,'commit':SHA}]);self.assertIsNone(error);self.assertTrue(receipt)
if __name__=='__main__':unittest.main()
